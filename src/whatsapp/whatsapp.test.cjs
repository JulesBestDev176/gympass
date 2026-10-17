require('ts-node/register/transpile-only');
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios').default;
const { WhatsappService } = require('./whatsapp.service.ts');
const { GymService } = require('../gym/gym.service.ts');
const config = (values = {}) => ({ get: key => ({ RELAYIO_BASE_URL: 'https://relay.example/v1', RELAYIO_API_KEY: 'test-key', RELAYIO_SESSION_ID: 'session-a', ...values })[key] });

test('GymBro credentials use the configured READY session and x-api-key, with one POST', async () => {
  const get = mock.method(axios, 'get', async (url, options) => {
    assert.equal(url, 'https://relay.example/v1/sessions');
    assert.equal(options.headers['x-api-key'], 'test-key');
    assert.ok(options.timeout <= 8000);
    return { data: [{ id: 'session-a', status: 'READY' }] };
  });
  const post = mock.method(axios, 'post', async (url, body, options) => {
    assert.equal(url, 'https://relay.example/v1/sessions/session-a/messages/text');
    assert.equal(body.chatId, '221770000000@s.whatsapp.net');
    assert.match(body.body, /GymBro/);
    assert.match(body.body, /temp-pass/);
    assert.match(body.body, /Awa/);
    assert.equal(options.headers['x-api-key'], 'test-key');
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(options.timeout <= 8000);
    return { data: { id: 'msg-one', status: 'pending' } };
  });
  try {
    assert.deepEqual(await new WhatsappService(config()).sendGymbroCredentials('77 000 00 00', 'temp-pass', 'Awa'), { status: 'accepted', messageId: 'msg-one' });
    assert.equal(post.mock.callCount(), 1);
  } finally {get.mock.restore();post.mock.restore();}
});

test('missing config, invalid phone, disconnected or ambiguous sessions never send', async () => {
  let sessions = [{ id: 'session-a', status: 'DISCONNECTED' }];
  const get = mock.method(axios, 'get', async () => ({ data: sessions }));
  const post = mock.method(axios, 'post', async () => { throw Error('must never send'); });
  try {
    assert.equal((await new WhatsappService(config({ RELAYIO_API_KEY: '' })).sendGymbroCredentials('+221770000000', 'pwd', 'Awa')).status, 'unconfigured');
    assert.equal(get.mock.callCount(), 0);
    assert.equal((await new WhatsappService(config()).sendGymbroCredentials('abc', 'pwd', 'Awa')).status, 'invalid_phone');
    assert.equal(get.mock.callCount(), 0);
    assert.equal((await new WhatsappService(config()).sendGymbroCredentials('00221770000000', 'pwd', 'Awa')).status, 'disconnected');
    sessions = [{ id: 'one', status: 'READY' }, { id: 'two', status: 'READY' }];
    assert.equal((await new WhatsappService(config({ RELAYIO_SESSION_ID: '' })).sendGymbroCredentials('+221770000000', 'pwd', 'Awa')).status, 'failed');
    assert.equal(post.mock.callCount(), 0);
  } finally {get.mock.restore();post.mock.restore();}
});

test('Relayio failure is bounded, never retried and never logged with password or API key', async () => {
  const service = new WhatsappService(config());
  const warnings = [];
  const warn = mock.method(service.logger, 'warn', message => warnings.push(message));
  const error = mock.method(service.logger, 'error', message => warnings.push(message));
  const get = mock.method(axios, 'get', async () => ({ data: [{ id: 'session-a', status: 'READY' }] }));
  const post = mock.method(axios, 'post', async () => { throw Error('temp-pass test-key'); });
  try {
    assert.equal((await service.sendGymbroCredentials('+221770000000', 'temp-pass', 'Awa')).status, 'failed');
    assert.equal(post.mock.callCount(), 1);
    assert.doesNotMatch(JSON.stringify(warnings), /temp-pass|test-key|221770000000/);
  } finally {warn.mock.restore();error.mock.restore();get.mock.restore();post.mock.restore();}
});

test('explicit Relayio rejection is not reported as accepted', async () => {
  const get = mock.method(axios, 'get', async () => ({ data: [{ id: 'session-a', status: 'READY' }] }));
  const post = mock.method(axios, 'post', async () => ({ data: { id: 'rejected', status: 'failed' } }));
  try {assert.equal((await new WhatsappService(config()).sendGymbroCredentials('+221770000000', 'pwd', 'Awa')).status, 'failed');}
  finally {get.mock.restore();post.mock.restore();}
});

for (const role of ['USER', 'COACH']) test(`creating ${role} sends only after persistence and returns a safe delivery result`, async () => {
  const events = [];
  const prisma = { gymbroUser: {
    findUnique: async () => null,
    create: async ({ data }) => { events.push('created'); return { id: 'new-account', ...data, passwordHash: 'private-hash', refreshTokenHash: 'private-refresh' }; },
  } };
  const delivery = { status: 'accepted', messageId: 'message-a' };
  const service = new GymService(prisma, { sendGymbroCredentials: async (...args) => {
    events.push('sent'); assert.deepEqual(args, ['+221770000000', 'temp-pass', 'Awa']); return delivery;
  } });
  const result = await service.createGymbroUser({ prenom: ' Awa ', nom: ' Ndiaye ', telephone: '+221770000000', password: 'temp-pass', role });
  assert.deepEqual(events, ['created', 'sent']);
  assert.deepEqual(result.whatsapp, delivery);
  assert.equal(result.role, role);
  assert.doesNotMatch(JSON.stringify(result), /private-hash|private-refresh|temp-pass/);
});

test('send failure keeps the created account and reports the failure without recreating it', async () => {
  let creates = 0;
  const prisma = { gymbroUser: { findUnique: async () => null, create: async ({ data }) => {creates++;return { id: 'persisted', ...data };} } };
  const result = await new GymService(prisma, { sendGymbroCredentials: async () => ({ status: 'failed' }) }).createGymbroUser({ prenom: 'Awa', nom: 'Ndiaye', telephone: '+221770000000', password: 'temp-pass' });
  assert.equal(creates, 1); assert.equal(result.id, 'persisted'); assert.equal(result.whatsapp.status, 'failed');
});

test('duplicate or failed database creation sends no message', async () => {
  let sends = 0;
  const relay = { sendGymbroCredentials: async () => {sends++;} };
  const dto = { prenom: 'Awa', nom: 'Ndiaye', telephone: '+221770000000', password: 'temp-pass' };
  await assert.rejects(new GymService({ gymbroUser: {findUnique: async () => ({ id: 'existing' })} }, relay).createGymbroUser(dto));
  await assert.rejects(new GymService({ gymbroUser: {findUnique: async () => null, create: async () => {throw Error('db failure');}} }, relay).createGymbroUser(dto));
  assert.equal(sends, 0);
});

test('automatic send creation requires a valid active ADMIN JWT as well as the GymDash secret', async t => {
  const { NestFactory } = require('@nestjs/core');
  const { Module } = require('@nestjs/common');
  const { ConfigService } = require('@nestjs/config');
  const { JwtService } = require('@nestjs/jwt');
  const { GymController } = require('../gym/gym.controller.ts');
  const { MembersService } = require('../members/members.service.ts');
  const { UsersService } = require('../users/users.service.ts');
  const { PrismaService } = require('../prisma/prisma.service.ts');
  const { JwtStrategy } = require('../auth/strategies/jwt.strategy.ts');
  let creates = 0;
  class TestModule {}
  Module({ controllers: [GymController], providers: [JwtStrategy,
    { provide: ConfigService, useValue: new ConfigService({JWT_SECRET: 'test-only-signing-key', GYMDASH_SECRET: 'test-only-dashboard', GYMDASH_BILLING_ADMIN_EMAILS: 'admin@example.test'}) },
    { provide: PrismaService, useValue: {user: {findUnique: async ({where}) => ({id: where.id, email: 'admin@example.test', actif: where.id !== 'inactive', role: where.id === 'admin' ? 'ADMIN' : 'GERANT'})}} },
    { provide: GymService, useValue: {createGymbroUser: async () => {creates++;return { id: 'fixture', whatsapp: {status: 'accepted'} };}} },
    { provide: MembersService, useValue: {} }, { provide: UsersService, useValue: {} },
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1'); t.after(() => app.close());
  const origin = await app.getUrl();
  const jwt = new JwtService({secret: 'test-only-signing-key'});
  const token = sub => jwt.sign({sub}, {expiresIn: '5m'});
  const request = async (accessToken, secret = 'test-only-dashboard') => {
    const headers = {'Content-Type': 'application/json', 'x-gymdash-secret': secret};
    if(accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(origin+'/gym/gymbro-user', {method:'POST',headers,body:'{}'});
  };
  assert.equal((await request()).status, 401);
  assert.equal((await request(token('gerant'))).status, 403);
  assert.equal((await request(token('inactive'))).status, 401);
  assert.equal((await request(token('admin'), 'wrong')).status, 401);
  assert.equal(creates, 0);
  assert.equal((await request(token('admin'))).status, 201);
  assert.equal(creates, 1);
});
