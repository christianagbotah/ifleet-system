# Fleetivo Notification Delivery Truth Design

## Goal
Make notification status reflect what Fleetivo actually persisted or what an external provider/runtime actually acknowledged, while removing the obsolete port-3004 notification dependency.

## Findings
- The Notification model already has `smsSent/smsSentAt/smsError`, `emailSent/emailSentAt/emailError`, and `pushSent/pushSentAt`, but SMS/email results are not persisted.
- SMS/email runtime services read process environment variables while Settings stores credentials in `SystemSettings`; test endpoints use the saved settings through separate code paths, so a test can pass while real notifications fail.
- Production SMS/email are currently disabled and unconfigured; 568 in-app notifications exist and external delivery evidence is 0 across SMS/email/push, so no historical repair is required.
- The active push dispatcher and browser hook still target a Socket.IO notification service on port 3004. Production port 3004 belongs to another application and Fleetivo has no notification-service daemon.
- Fleetivo already ships an authenticated same-process SSE stream and push pub/sub, but the dispatcher/browser hook do not use it.
- Settings exposes Arkesel, but the runtime SMS implementation is Hubtel-only.

## Design
1. **One channel configuration path.** SMS/email services load current `SystemSettings` first and use environment variables only as backward-compatible fallback. Settings test actions call the same runtime services rather than mutating environment variables or constructing a separate SMTP path.
2. **Channel gates are authoritative.** `smsEnabled` and `emailEnabled` suppress those channels before any provider call. Driver channel preferences remain a second-level gate. Unsupported SMS providers fail closed; the UI exposes Hubtel only until another provider has a real adapter.
3. **Persist evidence.** For user-linked notifications, provider acknowledgement updates the existing Notification row. SMS/email success means the provider/SMTP accepted the message, not end-device delivery. Failures persist an error marker; no contact/config/provider rejection is never recorded as sent.
4. **SSE real-time push.** The dispatcher uses in-process `emitPush`; a push is marked sent only when at least one active listener receives the event. The browser hook consumes the authenticated SSE endpoint with Bearer auth. No port 3004 or Caddy transform routing remains in the active path.
5. **Truthful UI.** Replace “Delivered via” with “Channel status.” Show `In-app saved`, `SMS accepted`, `Email accepted`, and `Live push sent`; show neutral failure badges without exposing raw provider error text to end users.
6. **No schema migration.** Existing delivery fields are sufficient.

## Out of Scope
- Provider delivery-receipt webhooks for final handset/inbox delivery.
- Adding an Arkesel adapter.
- Invoice WhatsApp deep-link semantics; `sendInvoiceNotification` currently has no callers and will be audited separately.
- Multi-instance Redis pub/sub; production is a single Fleetivo app instance.
