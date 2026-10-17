require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { AnalyticsService } = require('./analytics.service.ts');
const { buildRange } = require('./analytics.ts');
const { MembersService } = require('../members/members.service.ts');
const testUrl = process.env.ANALYTICS_TEST_DATABASE_URL;

test('PostgreSQL16 aggregates real half-open fixtures, current entitlements and shared periods', { skip: !testUrl }, async t => {
  // Fail closed: this script may push/reset ONLY the dedicated local fixture database.
  const url = new URL(testUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '15438');
  assert.equal(url.pathname, '/gympass_analytics_test');
  const pushed = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: require('node:path').resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: testUrl }, encoding: 'utf8',
  });
  assert.equal(pushed.status, 0, pushed.stderr);
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  t.after(() => db.$disconnect());
  // These tables exist only in the test database guarded above.
  await db.entry.deleteMany(); await db.payment.deleteMany(); await db.subscription.deleteMany();
  await db.sessionCard.deleteMany(); await db.member.deleteMany(); await db.user.deleteMany(); await db.gym.deleteMany();
  const now = new Date();
  const range = buildRange('30d', now);
  const before = new Date(range.from.getTime() - 1);
  const past = new Date(now.getTime() - 60000);
  const future = new Date(now.getTime() + 1000);
  const old = new Date(range.from.getTime() - 86400000);
  await db.gym.createMany({ data: [
    { id: 'a', nom: 'Alpha', slug: 'analytics-alpha', statut: 'ACTIF', createdAt: old },
    { id: 'b', nom: 'Beta', slug: 'analytics-beta', statut: 'SUSPENDU', createdAt: old },
    { id: 'future-gym', nom: 'Future', slug: 'analytics-future', statut: 'ACTIF', createdAt: future },
  ] });
  await db.user.create({ data: { id: 'user-a', gymId: 'a', nom: 'Fixture', prenom: 'Admin',
    email: 'analytics-fixture@example.invalid', passwordHash: 'test-only-unused-hash', role: 'ADMIN' } });
  const members = [
    ['active', 'a', range.from, true], ['disabled', 'a', past, false], ['none', 'b', before, true],
    ['session', 'b', before, true], ['soon', 'a', past, true], ['expired', 'a', before, true],
    ['recent', 'a', before, true], ['exact', 'a', before, true], ['future', 'a', future, true],
  ];
  await db.member.createMany({ data: members.map(([id, gymId, createdAt, carteActive]) => ({
    id, gymId, createdAt, carteActive, numeroCarte: 'fixture-' + id, qrCode: 'fixture-qr-' + id,
    nom: 'Fixture', prenom: id, telephone: '000000000',
  })) });
  const subscription = (id, memberId, offset, extra = {}) => ({ id, memberId, formule: 'Mensuel',
    statut: 'ACTIF', dateExpiration: new Date(now.getTime() + offset), createdAt: old, ...extra });
  const day = 86400000;
  await db.subscription.createMany({ data: [
    subscription('active-old', 'active', -10 * day),
    subscription('active-latest', 'active', 30 * day, { statut: 'EXPIRE' }),
    subscription('future-sub', 'active', 300 * day, { formule: 'Séance', statut: 'SEANCE_CONSOMMEE', createdAt: future }),
    subscription('disabled-sub', 'disabled', 30 * day),
    subscription('session-sub', 'session', -30 * day, { formule: 'Séance', statut: 'SEANCE_DISPONIBLE' }),
    subscription('soon-sub', 'soon', day), subscription('expired-sub', 'expired', -day - 1),
    subscription('recent-sub', 'recent', -1), subscription('exact-sub', 'exact', -day),
  ] });
  // Card balance does not override MembersService.computeStatus.
  await db.sessionCard.create({ data: { id: 'card-none', memberId: 'none', qrCode: 'fixture-card', seancesRestantes: 10, seancesTotal: 10 } });
  const payment = (id, gymId, memberId, montantFcfa, mode, createdAt) => ({ id, gymId, memberId, userId: 'user-a',
    type: 'ABONNEMENT', formule: 'Mensuel', montantFcfa, mode, createdAt });
  await db.payment.createMany({ data: [
    payment('from', 'a', 'active', 100, 'ESPECES', range.from),
    payment('past', 'a', 'disabled', 250, 'WAVE', past),
    payment('beta', 'b', 'none', 50, 'WAVE', past),
    payment('before', 'a', 'active', 999, 'ORANGE_MONEY', before),
    payment('at-to', 'a', 'active', 999, 'ORANGE_MONEY', now),
    payment('future', 'a', 'active', 999, 'ORANGE_MONEY', future),
  ] });
  const entry = (id, memberId, createdAt) => ({ id, memberId, createdAt, userId: 'user-a', formule: 'Mensuel', statut: 'ACTIF' });
  await db.entry.createMany({ data: [entry('from', 'active', range.from), entry('past', 'active', past),
    entry('beta', 'session', past), entry('before', 'active', before), entry('at-to', 'active', now), entry('future', 'active', future)] });
  const service = new AnalyticsService(db);
  const result = await service.getGlobalAnalytics('30d', now);
  assert.deepEqual(result.totals, { revenue: 400, payments: 3, newMembers: 3, entries: 3, activeGyms: 1, members: 8 });
  assert.equal(result.series.length, 30);
  assert.equal(result.series.reduce((sum, point) => sum + point.revenue, 0), 400);
  assert.equal(result.series.reduce((sum, point) => sum + point.newMembers, 0), 3);
  assert.equal(result.series.reduce((sum, point) => sum + point.entries, 0), 3);
  assert.deepEqual(result.gyms, [
    { id: 'a', name: 'Alpha', revenue: 350, payments: 2, newMembers: 3, entries: 2, members: 6 },
    { id: 'b', name: 'Beta', revenue: 50, payments: 1, newMembers: 0, entries: 1, members: 2 },
  ]);
  assert.deepEqual(result.paymentModes.find(mode => mode.mode === 'WAVE'), { mode: 'WAVE', label: 'Wave', amount: 300, count: 2 });
  assert.equal(result.paymentModes.find(mode => mode.mode === 'ORANGE_MONEY').amount, 0);
  const expectedStatuses = { ACTIF: 1, EXPIRE_DEMAIN: 2, EXPIRE: 3, SEANCE_DISPONIBLE: 1,
    SEANCE_CONSOMMEE: 0, CARTE_DESACTIVEE: 1, SANS_ABONNEMENT: 0 };
  assert.deepEqual(Object.fromEntries(result.subscriptions.map(status => [status.status, status.count])), expectedStatuses);
  const currentMembers = await db.member.findMany({ where: { createdAt: { lt: now } },
    include: { subscriptions: { where: { createdAt: { lt: now } } }, sessionCards: true } });
  const computed = Object.fromEntries(Object.keys(expectedStatuses).map(status => [status, 0]));
  currentMembers.forEach(member => computed[MembersService.computeStatus(member)]++);
  assert.deepEqual(computed, expectedStatuses);
  for (const [period, buckets] of [['90d', 13], ['6m', 6]]) {
    const expanded = await service.getGlobalAnalytics(period, now);
    assert.equal(expanded.series.length, buckets);
    assert.equal(expanded.totals.revenue, 1399);
    assert.equal(expanded.totals.payments, 4);
    assert.equal(expanded.totals.entries, 4);
    assert.equal(expanded.totals.newMembers, 8);
    assert.deepEqual(expanded.subscriptions, result.subscriptions);
    assert.equal(expanded.range.to, result.range.to);
  }
});
