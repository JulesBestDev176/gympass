# Boutique physique — backend delivery

The shop uses existing staff authentication and server-derived gym/user scope. Inventory writes require ADMIN; GERANT history is limited to their own sales in the current UTC Monday–Sunday week. Sale money comes from signed unit-price snapshots and integer quantities. Every gym's stock commands and sales use the same PostgreSQL transaction advisory lock; `(gymId, requestId)` unique indexes additionally enforce replay identity. Failed basket validation rolls back all movements, stock changes and sale lines.

Online sales reject inactive products, insufficient stock or a changed price version. Actual offline cash sales accept their original signed historical price, retain the encashment even if stock becomes negative, and mark `stockConflict` when insufficient stock is encountered. An ADMIN can replenish stock in stages or correct the remaining deficit through an online stock command. No per-phone quotas are used.

Price signatures use `SHOP_PRICE_SECRET`, falling back to the existing `JWT_SECRET`. Preserve the signing secret across restarts and deployments. Changing it invalidates cached snapshots, including pending offline events; reconcile pending devices before planned key rotation. Offline signatures have no arbitrary age expiry. The event must be dated from 2020 onward, no more than five minutes into the future, and after snapshot issuance (five-minute clock tolerance). Online signatures expire after 180 days. Current stock changes do not invalidate price versions.

Product images accept only the existing upload service's MinIO `/photos/<immutable-name>.<image-extension>` URLs. Shop never fetches a client-selected URL server-side.

## Production migration

`prisma/migrations/20261024120000_shop/migration.sql` adds four shop tables and their indexes/checks only. The entire SQL file is transactional. Back up the production database before rollout. Do not run every pending migration from the development branch.

`node scripts/shop-preflight.cjs` checks migration history and all expected shop columns. On a clean pre-shop schema it executes only this SQL file then marks only this migration applied. Existing partial/failed states stop startup for review. If SQL completed but marking the migration failed, inspect the schema and migration history before manually resolving it. The isolated staff release entrypoint invokes this preflight after the existing app-release preflight. Applying SQL requires a PostgreSQL role with the same DDL privileges as previous additive migrations.

## Verification

- `npm run build`
- `node --test src/shop/shop.service.test.cjs src/shop/shop.http.test.cjs scripts/shop-preflight.test.cjs`
- With an explicitly disposable PostgreSQL database containing the shop migration, set `SHOP_TEST_DATABASE_URL`, then run `node --test src/shop/shop.postgres.test.cjs src/finances/finances.shop.postgres.test.cjs`.

The PostgreSQL tests create isolated test rows and clean them after each run. The finance test also creates minimal stub legacy tables if absent; use only a disposable test database. They exercise concurrent sale retries, final-unit races, atomic multi-item rollback, stock-command idempotency, forged prices, cross-gym access, offline deficits, pagination, and the actual SQL finances union. No tests mutate production.
