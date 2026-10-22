# Bracelet sales API deployment — 2026-10-22

`main` contains `BraceletsModule`, its registration in `AppModule`, the Prisma models and migration `20261022130000_bracelets`.

The production 404 on `GET /api/v1/bracelets/stats` came from the isolated release branch, which did not contain that module. The production release now includes the same module and migration (release commit `0bc177068731c93c9dcf638a9982506e4675198f`).

The endpoint requires an authenticated account and scopes all aggregates to its gym. It returns `ventesToday`, `revenuToday`, `ventesMois`, and `revenuMois`. The home screen uses `ventesMois`; member receipts remain separate.

The standard `main` startup applies this migration through `prisma migrate deploy`. `scripts/bracelets-preflight.cjs` is also available for isolated releases that deliberately do not execute the complete migration history. It applies only this migration and records it in Prisma's migration history; unexpected partial schemas stop startup.

Production remains pinned to the isolated release branch. Switching production to `main` is a separate deployment involving the other changes on that branch.
