# Notification Delivery Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Fleetivo notification channel states derive from the same saved configuration and real delivery acknowledgements used by production runtime.

**Architecture:** Consolidate SMS/email configuration at the service boundary, gate delivery in the dispatcher, persist per-channel evidence on the existing Notification row, and replace the obsolete notification Socket.IO dependency with the existing authenticated in-process SSE push path. Keep final provider delivery receipts out of scope.

**Tech Stack:** Next.js 16, TypeScript, Prisma, Nodemailer, Hubtel HTTP API, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-notification-delivery-truth-design.md`

## Global Constraints
- Public brand remains Fleetivo; internal iFleetPro compatibility names remain unless directly touched.
- No new notification schema fields or external service daemon.
- Saved `SystemSettings` are primary channel config; environment is fallback only.
- `smsSent/emailSent` mean provider acceptance, not final recipient delivery.
- Only Hubtel is supported in this release.

## Review Focus
- Disabled SMS/email must never call an external provider.
- Saved credentials must take precedence over stale/missing process environment variables.
- Provider rejection or missing recipient contact must never set a sent flag.
- Push with zero active listeners must remain unsent; one active listener must mark it sent.
- SSE must remain authenticated and scoped to the signed-in user.

---

### Task 1: Authoritative Channel Configuration

**Files:**
- Create: `src/lib/services/channel-config.ts`
- Create/Test: `src/lib/services/__tests__/channel-config.test.ts`
- Modify: `src/lib/services/sms.ts`
- Modify: `src/lib/services/email.ts`
- Modify: `src/app/api/settings/channels/test-sms/route.ts`
- Modify: `src/app/api/settings/channels/test-email/route.ts`
- Modify: `src/app/api/settings/channels/route.ts`
- Modify: `src/components/settings/SettingsView.tsx`

**Interfaces:**
- Produces: runtime Hubtel and SMTP configuration resolved from current DB settings with environment fallback.

- [x] Write failing tests proving DB settings override env, env is fallback, and unsupported SMS provider fails closed.
- [x] Run focused tests and confirm RED for the missing shared resolver.
- [x] Implement the minimal resolver and update SMS/email services to use it.
- [x] Refactor test endpoints onto the same services and restrict Settings to Hubtel.
- [x] Run focused tests and confirm GREEN; commit.

### Task 2: Persist Channel Evidence and Gate Delivery

**Files:**
- Modify/Test: `src/lib/services/__tests__/notification-dispatcher.test.ts`
- Modify: `src/lib/services/notification-dispatcher.ts`
- Modify/Test: `src/lib/services/push.ts` and a focused push test.

**Interfaces:**
- Consumes: current `SystemSettings` and provider service results.
- Produces: accurate `smsSent/smsSentAt/smsError`, `emailSent/emailSentAt/emailError`, `pushSent/pushSentAt` values.

- [x] Write failing tests for disabled channels, SMS/email accepted and failed attempts, and push listener-count semantics.
- [x] Confirm RED.
- [x] Implement channel gates, persistent evidence, and in-process push delivery.
- [x] Run focused tests and confirm GREEN; commit.

### Task 3: Authenticated SSE Browser Push

**Files:**
- Modify: `src/lib/hooks/usePushNotifications.ts`
- Create/Test: `src/lib/hooks/usePushNotifications.test.tsx`
- Modify only if required: `src/app/api/notifications/stream/route.ts`

**Interfaces:**
- Consumes: auth-store Bearer token and `/api/notifications/stream?userId=...`.
- Produces: the existing `{ isConnected, lastPush, pushCount }` hook contract without Socket.IO/port 3004.

- [ ] Write a hook test with a controlled SSE response proving authenticated connection and notification delivery.
- [ ] Confirm RED against the old Socket.IO hook.
- [ ] Implement streaming fetch/SSE parsing and cancellation/reconnect behavior.
- [ ] Run focused hook/stream tests and confirm GREEN; commit.

### Task 4: Truthful Delivery Presentation

**Files:**
- Modify: `src/components/notifications/NotificationDetailDialog.tsx`
- Modify: `src/components/notifications/NotificationsView.tsx`
- Add/Test: focused notification delivery-status component/contract tests as appropriate.

**Interfaces:**
- Consumes: persisted notification delivery fields.
- Produces: acceptance/status wording that does not claim final recipient delivery.

- [ ] Write a failing UI test proving accepted and failed channels render distinct truthful labels.
- [ ] Confirm RED.
- [ ] Implement `Channel status`, accepted/live-sent labels, and generic failed-attempt labels.
- [ ] Run focused UI tests and confirm GREEN; commit.

### Task 5: Release Verification

- [ ] Run focused notification tests, full `bun run test`, `bun run lint`, secret scan, Prisma validation/generated-source drift, and `git diff --check`.
- [ ] Request code review and address findings with TDD.
- [ ] Push PR and require exact-head GitHub CI success (Test/Lint/Build/build metadata/Prisma drift).
- [ ] Squash merge using expected head SHA.
- [ ] Follow guarded production deploy to completion.
- [ ] Smoke production: exact SHA metadata, services stable, no port-3004 notification dependency in active bundle, SMS/email remain disabled/unconfigured, existing 568 records unchanged, authenticated SSE boundary healthy, and no false external-delivery evidence introduced.
