import test from 'node:test';
import assert from 'node:assert/strict';
import { deploy } from './coolify-deploy.mjs';

const sha = 'a'.repeat(40);
const base = { COOLIFY_BASE_URL: 'https://coolify.example', COOLIFY_API_TOKEN: 'private-token', COOLIFY_APP_UUID: 'app1', COOLIFY_DEPLOY_MODE: 'source', GITHUB_SHA: sha, GITHUB_REF_NAME: 'main', HEALTH_URL: 'https://api.example/health' };
function harness(overrides = {}) {
  const calls = [];
  const app = { build_pack: 'dockerfile', git_branch: 'main', git_commit_sha: 'b'.repeat(40) };
  const fetch = async (url, options = {}) => {
    calls.push({ url, ...options });
    let body = url.endsWith('/applications/app1') ? app : url.endsWith('/deploy') ? { deployments: [{ resource_uuid: 'app1', deployment_uuid: 'job1' }] } : url.endsWith('/deployments/job1') ? { status: 'finished' } : { ok: true };
    const status = overrides.status?.(url, options) ?? 200;
    body = overrides.body?.(url, options, body) ?? body;
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetch, sleep: async () => {}, log: () => {} };
}
test('missing token fails before any request', async () => {
  const h = harness();
  await assert.rejects(deploy({ env: { ...base, COOLIFY_API_TOKEN: '' }, ...h }), /COOLIFY_API_TOKEN/);
  assert.equal(h.calls.length, 0);
});
test('401 is actionable and does not disclose token or response body', async () => {
  const h = harness({ status: () => 401, body: () => ({ message: 'private-token' }) });
  await assert.rejects(deploy({ env: base, ...h }), e => /401.*COOLIFY_API_TOKEN/.test(e.message) && !e.message.includes('private-token'));
  assert.equal(h.calls.length, 1);
});
test('check-only authenticates without mutation', async () => {
  const h = harness();
  await deploy({ env: { ...base, COOLIFY_CHECK_ONLY: 'true' }, ...h });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].headers.Authorization, 'Bearer private-token');
});
test('main cannot replace the currently approved release branch', async () => {
  const h = harness({ body: (u, o, b) => u.endsWith('/applications/app1') ? { ...b, git_branch: 'release/approved' } : b });
  assert.equal((await deploy({ env: base, ...h })).skipped, true);
  assert.equal(h.calls.length, 1);
});
test('source deploy pins exact commit, triggers once and waits before health check', async () => {
  const h = harness();
  await deploy({ env: base, ...h });
  assert.deepEqual(JSON.parse(h.calls[1].body), { git_commit_sha: sha });
  assert.deepEqual(JSON.parse(h.calls[2].body), { uuid: 'app1', force: false });
  assert.equal(h.calls[3].url, 'https://coolify.example/api/v1/deployments/job1');
  assert.equal(h.calls[4].url, base.HEALTH_URL);
  assert.equal(h.calls[4].headers, undefined); // Never send the Coolify token to the application.
});
test('image deploy pins immutable SHA tag', async () => {
  const h = harness({ body: (u, o, b) => u.endsWith('/applications/app1') ? { build_pack: 'dockerimage' } : b });
  await deploy({ env: { ...base, COOLIFY_DEPLOY_MODE: 'image', IMAGE_NAME: 'owner/gymdash' }, ...h });
  assert.deepEqual(JSON.parse(h.calls[1].body), { docker_registry_image_name: 'owner/gymdash', docker_registry_image_tag: `sha-${sha}` });
});
test('unexpected deployment mode fails before changing configuration', async () => {
  const h = harness();
  await assert.rejects(deploy({ env: { ...base, COOLIFY_DEPLOY_MODE: 'image', IMAGE_NAME: 'owner/gymdash' }, ...h }), /dockerimage/);
  assert.equal(h.calls.length, 1);
});
test('trigger failure is not retried', async () => {
  const h = harness({ status: u => u.endsWith('/deploy') ? 503 : 200 });
  await assert.rejects(deploy({ env: base, ...h }), /503/);
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
});
test('failed deployment never becomes success just because old site is healthy', async () => {
  const h = harness({ body: (u, o, b) => u.includes('/deployments/') ? { status: 'failed' } : b });
  await assert.rejects(deploy({ env: base, ...h }), /failed/);
  assert.equal(h.calls.some(c => c.url === base.HEALTH_URL), false);
});
test('health failure fails deployment verification', async () => {
  const h = harness({ status: u => u === base.HEALTH_URL ? 503 : 200 });
  await assert.rejects(deploy({ env: base, ...h }), /Health check/);
});
test('pending deployment times out', async () => {
  const h = harness({ body: (u, o, b) => u.includes('/deployments/') ? { status: 'in_progress' } : b });
  await assert.rejects(deploy({ env: base, ...h, attempts: 2 }), /timed out/);
});
