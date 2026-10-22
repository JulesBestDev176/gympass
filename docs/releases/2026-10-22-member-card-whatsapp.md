# Automatic member card WhatsApp delivery - 2026-10-22

GymPass SN captures the card shown on the registration success screen after registration/payment/session-card creation completes, then uploads its PNG to POST /api/v1/members/:id/card-whatsapp. It no longer opens the phone sharing sheet in that success flow. The PNG contains the same QR codes and content as the visible card, without a status badge. The app must reach/render the success screen to generate this image.

The authenticated ADMIN/GERANT endpoint uses the JWT gym and persisted member phone only. It accepts one PNG up to 4 MiB with bounded dimensions; client recipient/URL fields are rejected. No public card URL is created. Relayio first receives the multipart media upload, then one messages/media call using mediaId and the corrected @s.whatsapp.net JID. The live media upload contract was checked with a non-personal 1-pixel image; no live message was sent in validation.

Persistent member fields cardWhatsappStatus/cardWhatsappAttemptedAt/cardWhatsappMessageId and an atomic pending reservation prevent concurrent/timeout duplicates. Accepted, pending and unconfirmed attempts are not sent again. Known pre-send failures or explicit refusals permit manual retry. Ambiguous HTTP 408/409/5xx and lost replies remain unconfirmed. GET on the same path reads the stored state. Mobile checks this state before retrying a finalized multipart request after session refresh; it rebuilds only for not_sent. A process crash after reservation requires review instead of an automatic resend.

UI distinguishes message acceptance from delivery and shows safe retry for known failures. Registration is retained when transmission fails. Existing standalone card sharing remains available outside the registration success flow. No inbound message reading was added.

Backend deployment is isolated on release/gympass-staff-20261022, based on the previous production 18edc7d. It includes ONLY the card delivery endpoint, media transport, three nullable Member fields and migration 20261022120000_member_card_whatsapp. Its startup script checks/records exactly that additive migration, preserves staff recovery setup, and never runs unrelated historical migrations or seeds. Main working-tree session-card/bracelet changes are excluded.

Validation: isolated backend build and 30 tests passed; 9 targeted Flutter tests passed, plus 13 existing scan tests from the earlier combined run. New Flutter code has no analyzer errors; registration screen retains existing warnings. Main npm build is separately blocked by concurrent SessionCard changes: prisma/seed.ts still uses the removed qrCode field (lines 177,211,215,222,226). Those unrelated changes were preserved.

Pre-deployment native PostgreSQL backup: s6stvjorrhkvepno6ldybloh, execution xij9xnvztsl0ry6uxyulkpah, success, 104046 bytes.

Rollback: restore prior Coolify git commit 18edc7d701634c71e708838202c90bd04799c437 on release/gympass-staff-20261022. Retain nullable Member fields and delivery records. No APK was rebuilt from the concurrently changing mobile tree; run/rebuild the updated Flutter app to use this flow.
