# Global analytics

`GET /api/v1/dashboard/global/analytics?period=30d|90d|6m` requires a valid active-user
access JWT, `x-gymdash-secret`, and the ADMIN role. Omitted period defaults to 30d;
invalid or repeated period values return 400. The existing `/global` endpoint is unchanged.

All event measurements use the same UTC half-open interval `[from, to)`, where
`to` is the captured request-time clock. The rolling 30/90 calendar days include
today; six months include the current UTC month and previous five months.
Series are zero-filled for these known intervals: daily for 30d, seven-day groups
anchored at range start for 90d, calendar months for 6m. The final day/week/month
is partial. Future records and records exactly at `to` are excluded by SQL.

Revenue includes all recorded payment types and uses FCFA integer amounts, not
predicted subscription value. Signups count newly created Member records; attendance
counts Entry records, including exceptional entries. Payment modes and per-gym
revenue, payment count, new member count and entries share the selected interval.
Entries are assigned to the member's current gym, since Entry has no gymId.

`totals.members`, `gyms[].members`, `totals.activeGyms`, and `subscriptions` are
**current snapshots**, independent of the selected start date, with future-created
members/gyms/subscriptions excluded. Active gyms have `statut=ACTIF`. Subscription
counts describe members, one member counted once, and mirror
`MembersService.computeStatus`: disabled carteActive wins; select the subscription
with greatest dateExpiration; no subscription means EXPIRE; formule exactly
`Séance` uses stored status; otherwise derive status from expiration using the
existing ceil-day rules. Consequently expiration up to less than 24 hours ago is
still EXPIRE_DEMAIN, expiration exactly 24 hours ago is EXPIRE, and expiration
within the next 24 hours is EXPIRE_DEMAIN. Session cards do not override status,
matching the current member service. Equal expiration dates break ties by latest
createdAt, then ID. Seven known statuses and six payment modes are zero-filled.

Five parameterized DB-side aggregate queries run in a RepeatableRead transaction;
only grouped daily/gym/mode rows and current group counts reach Node. No per-gym
or per-month query loop, raw customer list or schema change is needed. Date range
predicates leave createdAt unwrapped, allowing existing payment/entry indexes.
Member.createdAt has no index in the current schema; large signup scans may need
a separately reviewed future index. Snapshot status resolution uses memberId's
existing subscription index with a lateral latest-subscription lookup.

Tests: `node --test src/dashboard/analytics.test.cjs`. The endpoint protection
test runs the real JWT strategy and guards, with a test signing key and stubbed
user lookup; it never contacts production or sends notifications.

`analytics.postgres.test.cjs` additionally validates the actual SQL and service
against PostgreSQL 16. Start a disposable PostgreSQL 16 container bound only to
`127.0.0.1:15438`, with database `gympass_analytics_test` and test-only credentials.
Set `ANALYTICS_TEST_DATABASE_URL` to that fixture's URL, then run:

```powershell
node --test src/dashboard/analytics.postgres.test.cjs
```

The integration test skips without that explicit test URL, and rejects any URL
whose host, port or database differs from the fixture above. It pushes the
existing Prisma schema and replaces data only in the fixture, never using the
application's DATABASE_URL. Its boundary, payment-mode, gym and member-status
fixtures cover duplicate/latest subscriptions, disabled cards, ceil-day edge
cases, session-card behavior, and future records across all three periods.
Remove only the disposable container and its anonymous volume after testing.
