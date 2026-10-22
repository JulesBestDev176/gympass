# Registration fees and per-gym matricules

Registration now creates a member, one INSCRIPTION payment at the configured gym fee and an initial access period ending at the current UTC calendar month end, in one transaction. It creates no monthly payment and sends no separate welcome text: the card-image caption confirms registration. Mobile captures/sends the card after success using the existing persistent delivery reservation.

New matricules use gym word initials and a persistent per-gym counter starting at zero, with first allocation 001. Registration and replacement use the same atomic counter. Deletion never decrements it. Existing cards keep their numbers/QRs; new QRs include gym ID so two gyms with identical initials can independently issue the same visible number. The database enforces visible-number uniqueness within each gym.

Mobile submits the registration payment mode in one request and keeps a stable request key for timeout retries. A per-gym database lock and persistent unique key avoid repeated charges. Monthly renewals explicitly choose YYYY-MM; payment and subscription commit together before notification. Future months do not grant early access, and superseded expiration periods no longer send misleading renewal alerts.

Production startup applies only reviewed migration 20261022150000_registration_counter, after the existing staff/card preflights, without seeds or unrelated historical migrations. Adds gym memberCounter, optional registrationRequestId and optional payment moisCouvert; changes visible card uniqueness to (gymId,numeroCarte), adds request and monthly payment unique indexes. Nullable fields preserve legacy records. The deployed release retains its existing SessionCard/bracelet behavior; unrelated dirty main-tree work is excluded.

Verification includes Node unit/HTTP tests, PostgreSQL tests on localhost:15441/gympass_registration_test for concurrent number allocation, deletion, rollback, registration retry and renewal race, and Flutter registration/card/scanner tests. Backend build includes prisma/seed.ts. A release APK is built using the installed JDK21.

Maintenance script scripts/remove-member.cjs defaults to read-only. Execution requires exact phone and the previously audited member ID; it removes only that member's entries, payments, session cards and subscriptions in a transaction, then verifies absence. No outbound messages. A successful native PostgreSQL backup was taken before maintenance.

The new APK is required for the atomic registration request and calendar-month renewal selector. Production update is pinned to the isolated release commit; deployment results are recorded in the workspace .tmp/registration-deployment-20261022.json. Retain the additive fields if rolling code back; old code must not reset the counter or revive obsolete card IDs.
