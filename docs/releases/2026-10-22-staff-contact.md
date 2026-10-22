# Staff contact and secure password recovery release

Production previously ran 9944d52 without PATCH /users/admin/:id/contact.

This branch is based on that production commit and includes only staff contact, generated login emails, Relayio credential delivery, and secure password recovery. Unrelated GymBro programme/payment changes are excluded. Only the User schema block changes.

Startup executes scripts/staff-release-preflight.cjs. It applies the transactional 20261020200000_staff_password_recovery SQL and records exactly that migration. It never runs all historical migrations or production seeds. Existing duplicate phones abort the SQL transaction. Partial schema or missing unique index abort startup for review. No accounts are merged or removed.

Before deployment: native Coolify PostgreSQL backup qtxrkx2wdilmywxfs5nxolda succeeded (103079 bytes, execution ihvwuufttanzlgezjosgpqth). Production users table had 17 legacy columns and six staff accounts. Read-only grouping by gym and last nine phone digits returned no duplicates. The migration performs full normalization and a second duplicate check transactionally.

Validation: npm run build; node --require reflect-metadata --test scripts/staff-release-preflight.test.cjs src/auth/password-recovery.test.cjs src/auth/staff-recovery-http.test.cjs src/users/staff-security.test.cjs src/users/users-email.test.cjs src/users/phone-normalization.test.cjs src/whatsapp/whatsapp.test.cjs src/platform-billing/access.test.cjs.

Rollback: restore Coolify branch release/gymbro-exercise-catalog-20261017 at 9944d52. Keep additive staff columns/index (do not drop data). No real WhatsApp message is sent by automated verification.
