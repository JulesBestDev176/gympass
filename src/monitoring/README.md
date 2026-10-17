# Backend request telemetry

Set both environment variables to enable telemetry:

```dotenv
MONITORING_URL=http://gympass-monitoring:9108
MONITORING_TOKEN=<same-secret-as-the-internal-collector>
```

The URL is the collector origin on the private Docker network. The backend posts
to `/ingest` with `Authorization: Bearer MONITORING_TOKEN`; no public collector port
is needed. Missing either variable disables timers and request listeners. Invalid
URLs disable collection with a generic warning. Never expose these values in a browser.

Requests are timed with the monotonic high-resolution clock from middleware entry
until the response `finish` event (milliseconds). Completed 4xx and 5xx responses
are included. Connections that close without `finish` are not measured. Only the
resolved Express `req.route.path` template is kept, with `<unmatched>` for unresolved
or unsupported routes. Bodies, headers, path parameters, query strings, raw URLs
and IP addresses are never read or exported. Methods outside the standard HTTP
method set collapse to `<other>`. Collection routes `/ingest`, `/metrics` and
`*/monitoring/{ingest,metrics}` are excluded.

Every 30 seconds, the service batches UTC-minute, method and route aggregates as
`{batchId, app: "gympass-backend", points}`. Each point contains `minute`, `method`,
`route`, `count`, `errors4xx`, `errors5xx`, `durationSumMs`, `maxMs` and 18 **exclusive**
histogram counts. Bucket upper bounds in milliseconds are
`5,10,25,50,100,200,300,500,750,1000,1500,2000,3000,5000,10000,30000,60000`,
followed by overflow. Boundary values fall in the bucket ending at that value.

Requests never await the network. At most one flush runs concurrently; each HTTP
attempt times out after 5 seconds and redirects are rejected. Failed batches retain
the original UUID and contents, allowing the collector to deduplicate retries.
Successful batches are removed before subsequent sends. Requests arriving during a
flush accumulate separately. Successful recovery drains pending batches in order.

Memory is bounded to 500 active minute/method/route series and 10 pending batches
(at most 500 points each). Route templates are capped at 256 characters. New series
over capacity are dropped; if the retry queue is full at rotation, the newest
active batch is dropped. Warnings report cumulative `droppedRequests` and
`droppedPoints`, without route/request content. For active capacity overflow, each
dropped observation counts as one dropped point because it was never aggregated.
Warnings are emitted at flush time to bound logging overhead. Queue and active
data are memory-only and can be lost on restart. Shutdown hooks clear the timer
and attempt a final flush; collector persistence is responsible for history.

Run from `gympass_backend`:

```powershell
node --test src/monitoring/telemetry.test.cjs
npm run build
```

Tests use Node's built-in runner, ts-node and a local HTTP collector. They neither
contact production nor send notifications. No schema changes or migrations are needed.
