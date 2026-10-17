# Automatic credential messages

Creating a GymBro USER or COACH through `POST /api/v1/gym/gymbro-user` persists the account first, then makes one Relayio send attempt. JWT authentication, an active ADMIN role and the GymDash secret are required. Duplicate or failed account creation sends nothing. The response retains the user fields and adds `whatsapp: { status, messageId? }`; it never returns password hashes, refresh tokens or the submitted password.

Relayio uses `RELAYIO_BASE_URL` (including `/v1`), `RELAYIO_API_KEY` in `x-api-key`, and `RELAYIO_SESSION_ID`. A sole session can be selected automatically; multiple sessions require configuration. Only a READY session can send through `/sessions/:id/messages/text`, with `{chatId, body}`. Senegalese nine-digit local numbers gain `221`; international `+` and `00` prefixes are supported. Account login phone storage is preserved.

Each session lookup and send has a six-second timeout with no redirect or automatic retry. `accepted` means Relayio accepted the message, not that WhatsApp delivered it. Explicit upstream rejection, malformed replies, unavailable configuration, invalid phone and disconnected sessions return failure states while retaining the account. A timeout may be ambiguous; no automatic resend is made. No plaintext credentials or request errors containing secrets enter logs. Existing GymPass credentials, OTP and QR messages use the same corrected Relayio transport.

GymDash closes the creation form after success and displays an inline notice about message acceptance or failure. It never opens a phone WhatsApp link. Unit/service and real Nest guard tests use stubs only: `node --test src/whatsapp/whatsapp.test.cjs`. No real WhatsApp message is sent by these tests.
