require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createServer } = require('node:http');
const { RequestMetrics, requestTelemetry } = require('./request-metrics.ts');
  async function collector(t, respond = () => 204) {
    const requests = [];
    const server = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      requests.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(respond(requests.length));
      res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return { requests, url: `http://127.0.0.1:${server.address().port}` };
  }
  const observation = (extra = {}) => ({ method: 'GET', route: '/members/:id', status: 200,
    durationMs: 10, time: new Date('2026-10-17T20:12:49.900Z'), ...extra });

  test('emits exclusive histogram bins, minute and error counts through authenticated ingest', async t => {
    const sink = await collector(t);
    const metrics = new RequestMetrics({ url: sink.url, token: 'test-token' });
    for (const [durationMs, status] of [[0, 200], [5, 200], [5.1, 400], [10, 404], [60000, 500], [60001, 503]]) {
      metrics.record(observation({ durationMs, status }));
    }
    await metrics.flush();
    assert.equal(sink.requests[0].path, '/ingest');
    assert.equal(sink.requests[0].authorization, 'Bearer test-token');
    const batch = sink.requests[0].body;
    assert.equal(batch.app, 'gympass-backend');
    assert.match(batch.batchId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(batch.points, [{ minute: '2026-10-17T20:12:00.000Z', method: 'GET', route: '/members/:id',
      count: 6, errors4xx: 2, errors5xx: 2, durationSumMs: 120021.1, maxMs: 60001,
      buckets: [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1] }]);
  });

  test('finish uses resolved template and monotonic duration without retaining request content', async t => {
    const sink = await collector(t);
    const metrics = new RequestMetrics({ url: sink.url, token: 'test-token' });
    const middleware = requestTelemetry(metrics);
    const req = { method: 'GET', url: '/members/private-id?token=secret', originalUrl: '/members/private-id',
      body: { email: 'private@example.com' }, headers: { authorization: 'secret' } };
    const res = new EventEmitter();
    res.statusCode = 403;
    let continued = false;
    middleware(req, res, () => { continued = true; });
    assert.equal(continued, true);
    await new Promise(resolve => setTimeout(resolve, 15));
    req.route = { path: '/api/v1/members/:id' };
    res.emit('finish');
    res.emit('finish');
    await metrics.flush();
    const payload = JSON.stringify(sink.requests);
    assert.equal(/private-id|secret|private@example/.test(payload), false);
    const point = sink.requests[0].body.points[0];
    assert.equal(point.route, '/api/v1/members/:id');
    assert.equal(point.count, 1);
    assert.equal(point.errors4xx, 1);
    assert.ok(point.durationSumMs >= 10 && point.durationSumMs < 2000);
  });

  test('unmatched URLs collapse into one route and collector routes are excluded', async t => {
    const sink = await collector(t);
    const metrics = new RequestMetrics({ url: sink.url, token: 'test-token' });
    const middleware = requestTelemetry(metrics);
    for (const url of ['/private/person-a?key=x', '/private/person-b']) {
      const res = new EventEmitter(); res.statusCode = 404;
      middleware({ method: 'get', url }, res, () => {}); res.emit('finish');
    }
    metrics.record(observation({ route: '/ingest' }));
    metrics.record(observation({ route: '/metrics' }));
    await metrics.flush();
    assert.equal(sink.requests[0].body.points.length, 1);
    assert.equal(sink.requests[0].body.points[0].route, '<unmatched>');
    assert.equal(sink.requests[0].body.points[0].count, 2);
  });

  test('real Nest routes aggregate different IDs and never export unmatched raw paths', async t => {
    const { NestFactory } = require('@nestjs/core');
    const { Controller, Get, Module } = require('@nestjs/common');
    class MembersController { read() { return { ok: true }; } }
    Controller('members')(MembersController);
    Get(':id')(MembersController.prototype, 'read', Object.getOwnPropertyDescriptor(MembersController.prototype, 'read'));
    class TestModule {}
    Module({ controllers: [MembersController] })(TestModule);
    const sink = await collector(t);
    const metrics = new RequestMetrics({ url: sink.url, token: 'test-token' });
    const app = await NestFactory.create(TestModule, { logger: false });
    app.use(requestTelemetry(metrics));
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    t.after(() => app.close());
    const origin = await app.getUrl();
    for (const path of ['/api/v1/members/private-id-a?token=secret-query', '/api/v1/members/private-id-b',
      '/private-id-c?token=secret-query', '/private-id-d']) {
      const response = await fetch(origin + path);
      await response.text();
    }
    await metrics.flush();
    const points = sink.requests[0].body.points;
    assert.equal(points.length, 2);
    const matched = points.find(point => point.route === '/api/v1/members/:id');
    const unmatched = points.find(point => point.route === '<unmatched>');
    assert.equal(matched.count, 2);
    assert.equal(unmatched.count, 2);
    assert.equal(unmatched.errors4xx, 2);
    assert.equal(/private-id|secret-query/.test(JSON.stringify(points)), false);
  });

  test('failed batches retry with identical IDs and content while new requests remain separate', async t => {
    const sink = await collector(t, n => n === 1 ? 503 : 204);
    const warnings = [];
    const metrics = new RequestMetrics({ url: sink.url, token: 'test-token', warn: text => warnings.push(text) });
    metrics.record(observation());
    await metrics.flush();
    metrics.record(observation({ status: 500 }));
    await metrics.flush();
    assert.deepEqual(sink.requests[1].body, sink.requests[0].body);
    assert.notEqual(sink.requests[2].body.batchId, sink.requests[0].body.batchId);
    assert.equal(sink.requests[2].body.points[0].count, 1);
    assert.equal(sink.requests[2].body.points[0].errors5xx, 1);
    await metrics.flush();
    assert.equal(sink.requests.length, 3);
    assert.equal(warnings.length, 1);
  });

  test('missing either configuration value disables recording and middleware listeners', async () => {
    for (const options of [{}, { url: 'http://127.0.0.1:1' }, { token: 'test-token' }]) {
      const metrics = new RequestMetrics(options);
      assert.equal(metrics.enabled, false);
      metrics.record(observation());
      const res = new EventEmitter();
      requestTelemetry(metrics)({ method: 'GET' }, res, () => {});
      assert.equal(res.listenerCount('finish'), 0);
      await metrics.flush();
      assert.equal(metrics.droppedRequests, 0);
    }
  });

  test('bounded series and retry queue report dropped requests without request details', async t => {
    const sink = await collector(t, () => 503);
    const warnings = [];
    const metrics = new RequestMetrics({ url: sink.url, token: 'test-token', maxSeries: 2,
      maxPendingBatches: 2, warn: text => warnings.push(text) });
    metrics.record(observation({ route: '/one' }));
    metrics.record(observation({ route: '/two' }));
    metrics.record(observation({ route: '/private-route' }));
    await metrics.flush();
    metrics.record(observation()); await metrics.flush();
    metrics.record(observation()); await metrics.flush();
    assert.equal(metrics.droppedRequests, 2);
    assert.equal(metrics.droppedPoints, 2);
    assert.equal(metrics.pendingBatches, 2);
    assert.equal(warnings.some(text => text.includes('droppedRequests=2')), true);
    assert.equal(warnings.some(text => text.includes('/private-route')), false);
  });

  test('concurrent flushes never send a batch twice in parallel', async () => {
    let finish;
    let sends = 0;
    const metrics = new RequestMetrics({ url: 'http://collector', token: 'test-token',
      fetch: async () => { sends++; await new Promise(resolve => { finish = resolve; }); return { ok: true }; } });
    metrics.record(observation());
    const running = metrics.flush();
    await metrics.flush();
    assert.equal(sends, 1);
    finish(); await running;
  });
