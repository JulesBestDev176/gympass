require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildRange, assembleAnalytics, analyticsQueries } = require('./analytics.ts');
  const now = new Date('2026-03-01T00:15:00.000Z');
  const emptyRows = () => ({ payments: [], members: [], entries: [], gyms: [], subscriptions: [] });

  test('UTC rolling ranges include today, span leap/calendar boundaries and reject unsupported periods', () => {
    const thirty = buildRange('30d', now);
    assert.equal(thirty.from.toISOString(), '2026-01-31T00:00:00.000Z');
    assert.equal(thirty.to.toISOString(), '2026-03-01T00:15:00.000Z');
    assert.equal(thirty.granularity, 'day');
    assert.equal(buildRange('90d', now).from.toISOString(), '2025-12-02T00:00:00.000Z');
    const six = buildRange('6m', new Date('2026-01-31T23:59:59Z'));
    assert.equal(six.from.toISOString(), '2025-08-01T00:00:00.000Z');
    assert.equal(six.granularity, 'month');
    assert.equal(buildRange(undefined, now).period, '30d');
    assert.throws(() => buildRange('invalid', now), /period/i);
    assert.throws(() => buildRange(['30d'], now), /period/i);
    assert.equal(buildRange('30d', new Date('2024-03-01T12:00:00Z')).from.toISOString(), '2024-02-01T00:00:00.000Z');
  });

  test('known empty results zero-fill 30 days, 13 anchored weeks and six months', () => {
    for (const [period, length] of [['30d', 30], ['90d', 13], ['6m', 6]]) {
      const result = assembleAnalytics(buildRange(period, now), emptyRows());
      assert.equal(result.series.length, length);
      assert.ok(result.series.every(p => p.revenue === 0 && p.newMembers === 0 && p.entries === 0));
      assert.deepEqual(result.totals, { revenue: 0, payments: 0, newMembers: 0, entries: 0, activeGyms: 0, members: 0 });
      assert.equal(result.paymentModes.length, 6);
      assert.equal(result.subscriptions.length, 7);
    }
  });

  test('grouped rows merge consistently across series, payment modes, gym comparison and current snapshots', () => {
    const range = buildRange('90d', now);
    const result = assembleAnalytics(range, {
      payments: [
        { day: '2025-12-02', gymId: 'a', mode: 'ESPECES', amount: 100n, count: 1n },
        { day: '2025-12-08', gymId: 'a', mode: 'WAVE', amount: 250n, count: 2n },
        { day: '2025-12-09', gymId: 'b', mode: 'WAVE', amount: 75n, count: 1n },
        { day: '2025-12-01', gymId: 'a', mode: 'ESPECES', amount: 999n, count: 1n },
        { day: '2026-03-02', gymId: 'a', mode: 'ESPECES', amount: 999n, count: 1n },
      ],
      members: [{ day: '2025-12-09', gymId: 'b', count: 3n }],
      entries: [{ day: '2025-12-02', gymId: 'a', count: 9n }],
      gyms: [{ id: 'a', name: 'Alpha', status: 'ACTIF', members: 10n }, { id: 'b', name: 'Beta', status: 'SUSPENDU', members: 5n }],
      subscriptions: [{ status: 'ACTIF', count: 10n }, { status: 'EXPIRE', count: 5n }],
    });
    assert.deepEqual(result.totals, { revenue: 425, payments: 4, newMembers: 3, entries: 9, activeGyms: 1, members: 15 });
    assert.equal(result.series[0].key, '2025-12-02');
    assert.equal(result.series[0].revenue, 350);
    assert.equal(result.series[1].key, '2025-12-09');
    assert.equal(result.series[1].revenue, 75);
    assert.equal(result.series[1].newMembers, 3);
    assert.deepEqual(result.paymentModes.find(p => p.mode === 'WAVE'), { mode: 'WAVE', label: 'Wave', amount: 325, count: 3 });
    assert.deepEqual(result.gyms.find(g => g.id === 'a'), { id: 'a', name: 'Alpha', revenue: 350, payments: 3, newMembers: 0, entries: 9, members: 10 });
    assert.equal(result.subscriptions.find(s => s.status === 'EXPIRE').count, 5);
    assert.equal(result.range.from, '2025-12-02T00:00:00.000Z');
    assert.equal(result.range.to, now.toISOString());
    assert.equal(result.generatedAt, now.toISOString());
    assert.doesNotThrow(() => JSON.stringify(result));
  });

  test('six-month buckets retain month boundaries and omit future day groups', () => {
    const rows = emptyRows();
    rows.members = [{ day: '2025-10-01', gymId: 'a', count: 2n }, { day: '2026-03-01', gymId: 'a', count: 3n },
      { day: '2026-04-01', gymId: 'a', count: 99n }];
    rows.gyms = [{ id: 'a', name: 'Alpha', status: 'ACTIF', members: 5n }];
    const result = assembleAnalytics(buildRange('6m', now), rows);
    assert.equal(result.series[0].key, '2025-10');
    assert.equal(result.series[0].newMembers, 2);
    assert.equal(result.series[5].key, '2026-03');
    assert.equal(result.series[5].newMembers, 3);
    assert.equal(result.totals.newMembers, 5);
  });

  test('SQL contracts bind common half-open timestamps and never interpolate user input', () => {
    const range = buildRange('30d', now);
    const queries = analyticsQueries(range);
    assert.equal(Object.keys(queries).length, 5);
    for (const key of ['payments', 'members', 'entries']) {
      const query = queries[key];
      assert.ok(query.values.some(value => value instanceof Date && value.getTime() === range.from.getTime()));
      assert.ok(query.values.some(value => value instanceof Date && value.getTime() === range.to.getTime()));
      assert.match(query.sql, /"createdAt" >= \?/);
      assert.match(query.sql, /"createdAt" < \?/);
      assert.match(query.sql, /GROUP BY/);
    }
    assert.match(queries.subscriptions.sql, /LATERAL/);
    assert.match(queries.subscriptions.sql, /"carteActive"/);
    assert.match(queries.subscriptions.sql, /ORDER BY.*"dateExpiration" DESC/s);
  });

  test('analytics HTTP endpoint requires JWT, GymDash secret and ADMIN while preserving global endpoint', async t => {
    const { NestFactory } = require('@nestjs/core');
    const { Module } = require('@nestjs/common');
    const { ConfigService } = require('@nestjs/config');
    const { JwtService } = require('@nestjs/jwt');
    const { DashboardController } = require('./dashboard.controller.ts');
    const { DashboardService } = require('./dashboard.service.ts');
    const { AnalyticsService } = require('./analytics.service.ts');
    const { PrismaService } = require('../prisma/prisma.service.ts');
    const { JwtStrategy } = require('../auth/strategies/jwt.strategy.ts');
    const config = new ConfigService({ JWT_SECRET: 'analytics-test-signing-secret', GYMDASH_SECRET: 'analytics-test-gymdash', GYMDASH_BILLING_ADMIN_EMAILS: 'admin@example.test' });
    const payload = assembleAnalytics(buildRange('30d', now), emptyRows());
    let calls = 0;
    class TestModule {}
    Module({ controllers: [DashboardController], providers: [
      JwtStrategy,
      { provide: ConfigService, useValue: config },
      { provide: PrismaService, useValue: { user: { findUnique: async ({ where }) =>
        where.id === 'missing' ? null : { id: where.id, email: 'admin@example.test', actif: where.id !== 'inactive', role: where.id === 'admin' ? 'ADMIN' : 'GERANT' } } } },
      { provide: DashboardService, useValue: { getGlobalStats: () => ({ preserved: true }) } },
      { provide: AnalyticsService, useValue: { getGlobalAnalytics: period => { calls++; buildRange(period, now); return payload; } } },
    ] })(TestModule);
    const app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    t.after(() => app.close());
    const origin = await app.getUrl();
    const jwt = new JwtService({ secret: 'analytics-test-signing-secret' });
    const token = (sub, extra = {}) => jwt.sign({ sub, ...extra }, { expiresIn: '5m' });
    const endpoint = '/api/v1/dashboard/global/analytics';
    const request = async (path, jwtToken, secret) => {
      const headers = {};
      if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;
      if (secret) headers['x-gymdash-secret'] = secret;
      const response = await fetch(origin + path, { headers });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await request(endpoint)).status, 401);
    assert.equal((await request(endpoint, token('admin'))).status, 401);
    assert.equal((await request(endpoint, token('admin'), 'wrong')).status, 401);
    assert.equal((await request(endpoint, token('gerant'), 'analytics-test-gymdash')).status, 403);
    assert.equal((await request(endpoint, token('inactive'), 'analytics-test-gymdash')).status, 401);
    assert.equal((await request(endpoint, token('admin', { tokenType: 'refresh' }), 'analytics-test-gymdash')).status, 401);
    assert.equal(calls, 0);
    const allowed = await request(endpoint + '?period=90d', token('admin'), 'analytics-test-gymdash');
    assert.equal(allowed.status, 200);
    assert.deepEqual(allowed.body, payload);
    assert.equal((await request(endpoint + '?period=bad', token('admin'), 'analytics-test-gymdash')).status, 400);
    assert.equal((await request(endpoint + '?period=30d&period=90d', token('admin'), 'analytics-test-gymdash')).status, 400);
    assert.equal((await request('/api/v1/dashboard/global', token('gerant'), 'analytics-test-gymdash')).status, 403);
    const oldGlobal = await request('/api/v1/dashboard/global', token('admin'), 'analytics-test-gymdash');
    assert.equal(oldGlobal.status, 200);
    assert.deepEqual(oldGlobal.body, { preserved: true });
  });
