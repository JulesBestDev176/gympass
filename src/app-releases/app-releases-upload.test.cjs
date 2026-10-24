require('ts-node/register/transpile-only');
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Test } = require('@nestjs/testing');
const { AppReleasesController } = require('./app-releases.controller.ts');
const { AppReleasesService } = require('./app-releases.service.ts');
const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard.ts');
const { BillingAdminGuard } = require('../platform-billing/billing-admin.guard.ts');

// Exercise the real Nest/Multer/Busboy parser, with only auth and storage stubbed.
test('APK multipart accepts exactly one file and notes, retaining overflow protections', async t => {
  const received = [];
  const service = { createDraft: async (file, notes, actor) => {
    try {
      received.push({ bytes: await fs.readFile(file.path, 'utf8'), notes, actor });
      return { id: 'draft-only', status: 'DRAFT' };
    } finally { await fs.unlink(file.path); }
  } };
  const mod = await Test.createTestingModule({
    controllers: [AppReleasesController],
    providers: [{ provide: AppReleasesService, useValue: service }],
  }).overrideGuard(JwtAuthGuard).useValue({ canActivate: ctx => {
    ctx.switchToHttp().getRequest().user = { id: 'platform-admin' };
    return true;
  } }).overrideGuard(BillingAdminGuard).useValue({ canActivate: () => true }).compile();
  const app = mod.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const url = (await app.getUrl()) + '/api/v1/app-releases/admin';
  const send = body => fetch(url, { method: 'POST', body });
  const addApk = form => form.append('apk', new Blob(['fixture-bytes']), 'fixture.apk');

  for (const notesFirst of [false, true]) {
    await t.test(`accepts APK and notes (${notesFirst ? 'notes' : 'APK'} first)`, async () => {
      const form = new FormData();
      if (notesFirst) form.append('notes', 'Correction du scanner');
      addApk(form);
      if (!notesFirst) form.append('notes', 'Correction du scanner');
      const response = await send(form);
      assert.equal(response.status, 201, JSON.stringify(await response.json()));
      assert.deepEqual(received.at(-1), { bytes: 'fixture-bytes', notes: 'Correction du scanner', actor: 'platform-admin' });
    });
  }
  await t.test('accepts an empty notes field sent by the dashboard', async () => {
    const form = new FormData(); addApk(form); form.append('notes', '');
    const response = await send(form);
    assert.equal(response.status, 201, JSON.stringify(await response.json()));
    assert.equal(received.at(-1).notes, '');
  });
  for (const extra of ['field', 'file']) {
    await t.test(`rejects an extra ${extra} and cleans up temporary uploads`, async () => {
      const temp = require('node:os').tmpdir();
      const before = new Set((await fs.readdir(temp)).filter(n => n.startsWith('gympass-apk-')));
      const count = received.length;
      const form = new FormData(); addApk(form); form.append('notes', 'notes');
      if (extra === 'field') form.append('extra', 'rejected'); else addApk(form);
      assert.equal((await send(form)).status, 400);
      assert.equal(received.length, count);
      assert.deepEqual((await fs.readdir(temp)).filter(n => n.startsWith('gympass-apk-') && !before.has(n)), []);
    });
  }
});
