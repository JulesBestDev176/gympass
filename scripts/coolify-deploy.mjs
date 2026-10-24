import { pathToFileURL } from 'node:url';

// Kept in each independent repository so deployment never depends on another repo.
export async function deploy({ env = process.env, fetch = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), log = console.log, attempts = 180 } = {}) {
  const required = name => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}; configure GitHub Actions secrets/variables.`);
    return value;
  };
  const base = required('COOLIFY_BASE_URL').replace(/\/+$/, '');
  const token = required('COOLIFY_API_TOKEN');
  const uuid = required('COOLIFY_APP_UUID');
  const origin = new URL(base);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('COOLIFY_BASE_URL must be the configured Coolify origin, without /api/v1 or credentials.');
  }
  if (!/^[a-zA-Z0-9]+$/.test(uuid)) throw new Error('Invalid COOLIFY_APP_UUID');
  const mode = required('COOLIFY_DEPLOY_MODE');
  if (!['source', 'image'].includes(mode)) throw new Error('COOLIFY_DEPLOY_MODE must be source or image');
  const api = async (path, method = 'GET', body) => {
    let response;
    try {
      response = await fetch(`${base}/api/v1${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error(`Coolify ${method} ${path} could not complete. No automatic replay; inspect Coolify before rerunning.`);
    }
    if (!response.ok) {
      // Never print response bodies: they may contain configuration or credentials.
      throw new Error(`Coolify ${method} ${path}: HTTP ${response.status}${response.status === 401 ? '; replace COOLIFY_API_TOKEN with a valid Coolify API token' : response.status === 403 ? '; check token permissions/IP allowlist' : ''}`);
    }
    try { return await response.json(); }
    catch { throw new Error(`Coolify ${method} ${path}: expected a JSON response`); }
  };
  const app = await api(`/applications/${uuid}`);
  if (env.COOLIFY_CHECK_ONLY === 'true') {
    log('Coolify authentication verified (read-only).');
    return { checked: true };
  }
  const sha = required('GITHUB_SHA');
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('GITHUB_SHA must be the full commit SHA');
  const health = new URL(required('HEALTH_URL'));
  if (health.protocol !== 'https:' || health.username || health.password) throw new Error('HEALTH_URL must use HTTPS without credentials');
  let patch;
  if (mode === 'source') {
    if (app.build_pack !== 'dockerfile') throw new Error('Expected a dockerfile application; refusing to change its deployment mode');
    const branch = required('GITHUB_REF_NAME');
    if (app.git_branch !== branch) {
      log(`Deployment skipped: this branch does not match the production branch configured in Coolify. Image remains available for release.`);
      return { skipped: true };
    }
    patch = { git_commit_sha: sha };
  } else {
    if (app.build_pack !== 'dockerimage') throw new Error('Expected a dockerimage application; refusing to change its deployment mode');
    const image = required('IMAGE_NAME');
    if (!/^[a-z0-9._-]+\/[a-z0-9._-]+$/.test(image)) throw new Error('Invalid Docker Hub IMAGE_NAME');
    patch = { docker_registry_image_name: image, docker_registry_image_tag: `sha-${sha}` };
  }
  log(`Deploying commit ${sha}; previous revision: ${mode === 'source' ? app.git_commit_sha : app.docker_registry_image_tag}`);
  await api(`/applications/${uuid}`, 'PATCH', patch);
  const result = await api('/deploy', 'POST', { uuid, force: false });
  const deployment = result.deployments?.find(d => d.resource_uuid === uuid);
  const id = deployment?.deployment_uuid;
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) throw new Error('Coolify did not return a deployment UUID; inspect its queue before rerunning.');
  log(`Coolify deployment: ${id}`);
  let finished = false;
  for (let i = 0; i < attempts; i++) {
    const state = await api(`/deployments/${id}`);
    const status = state.status ?? state.deployment?.status;
    if (status === 'finished') { finished = true; break; }
    if (['failed', 'cancelled', 'canceled'].includes(status)) throw new Error(`Coolify deployment ${id}: ${status}`);
    await sleep(10_000);
  }
  if (!finished) throw new Error(`Coolify deployment ${id} timed out; inspect the queue before rerunning.`);
  for (let i = 0; i < 12; i++) {
    try {
      const response = await fetch(health.href, { redirect: 'error', signal: AbortSignal.timeout(15_000), cache: 'no-store' });
      if (response.ok) { log('Deployment finished and public health check passed.'); return { deployment: id }; }
    } catch { /* Only read-only health checks are retried. */ }
    await sleep(5_000);
  }
  throw new Error(`Health check failed after deployment ${id}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
}
