# Ghana Haulage OS Phase 5 — Video Telematics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-conscious, vendor-neutral MDVR/dashcam support for on-demand live view, event clips, snapshots and ADAS/DMS alarms without continuous cloud streaming by default.

**Architecture:** Extend the Phase 3 telematics provider contract with optional video capabilities. Store only normalized video session/event metadata and signed/expiring playback references; edge devices/vendor platforms remain the primary recording source unless a customer explicitly configures upload retention.

**Tech Stack:** Next.js 16, TypeScript, Prisma/MariaDB, existing telematics provider adapters, Vitest, signed server URLs/provider tokens, React UI.

**Spec:** `docs/superpowers/specs/2026-10-07-ghana-haulage-os-design.md`

## Global Constraints

- Continuous cloud video streaming/recording is not the default.
- Live view/playback is RBAC-protected and audited.
- Playback/live URLs are short-lived and never persisted as reusable public URLs.
- Driver/privacy policy acknowledgement and customer retention settings must be representable.
- Vendor video APIs remain behind provider adapters.

## Review Focus

- Expired signed URLs must stop working without invalidating the underlying vendor recording.
- A user without video permission must not learn camera URLs/channel identifiers through API errors.
- Device without video support must degrade cleanly to “unavailable,” not fail the Control Tower.
- Replayed/duplicated alarm webhooks must create one normalized incident.
- Retention deletion must remove cloud-copied media while preserving non-sensitive audit/incident metadata required by policy.

---

### Task 1: Extend device registry with camera/channel capabilities

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/domain/telematics/provider.ts`
- Create: `src/lib/domain/video/capabilities.ts`
- Create: `src/lib/domain/video/__tests__/capabilities.test.ts`
- Modify: `src/app/(dashboard)/telematics/devices/page.tsx`

**Interfaces:**
- Produces `CameraChannel`, `VideoRetentionPolicy` and `VideoCapabilities`.
- Provider optional methods: `requestLiveVideo`, `requestPlaybackClip`, `requestSnapshot`.

- [ ] Write failing tests for front/cabin/rear/side channel mapping, non-video device, mixed device capabilities and disabled camera.
- [ ] Add additive schema and capability normalizer.
- [ ] Update device page to configure channel labels/orientation/privacy class without storing vendor secrets.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add video telematics device capabilities`.

### Task 2: Add normalized video alarms/incidents

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/video/alarm-normalizer.ts`
- Create: `src/lib/domain/video/__tests__/alarm-normalizer.test.ts`
- Create: `src/app/api/video/ingest/[provider]/route.ts`

**Interfaces:**
- Produces `VideoAlarmEvent`, `VideoIncident`.
- Normalized alarm types include collision, harsh braking/acceleration, speeding, fatigue, distraction/phone use, route deviation, panic/SOS, cargo-door, unauthorized stop and device power tamper.

- [ ] Write failing tests for vendor code mapping, duplicate provider event ID, severity normalization, unknown code preservation and location/trip association.
- [ ] Implement normalized ingestion using Phase 3 provider/device binding and Phase 0 machine authentication.
- [ ] Create incident only once per dedupe key and link route/location context when available.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: normalize video and ADAS DMS incidents`.

### Task 3: Implement live-view and playback authorization broker

**Files:**
- Create: `src/lib/domain/video/access.ts`
- Create: `src/lib/domain/video/__tests__/access.test.ts`
- Create: `src/app/api/video/devices/[deviceId]/live/route.ts`
- Create: `src/app/api/video/incidents/[incidentId]/playback/route.ts`

**Interfaces:**
- Produces `authorizeVideoAccess(actor, resource, action): VideoAccessDecision` and server-side provider broker returning short-lived playback/session descriptors.

- [ ] Write failing tests for allowed fleet manager, forbidden driver/unrelated client, expired session, channel privacy restrictions and audit creation.
- [ ] Implement permission checks before provider call; response contains only short-lived session URL/token and expiry.
- [ ] Audit every request outcome without persisting raw provider credentials.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: secure video live and playback access`.

### Task 4: Add Control Tower camera/incident UX

**Files:**
- Modify: `src/components/tracking/VehicleTelemetryDrawer.tsx`
- Create: `src/components/video/LiveCameraDialog.tsx`
- Create: `src/components/video/IncidentTimeline.tsx`
- Create: `src/app/(dashboard)/video-incidents/page.tsx`

**Interfaces:**
- Consumes video capabilities, live broker and playback broker from Tasks 1–3.

- [ ] Add UI tests/service mocks for video unavailable, permission denied, successful live session and expired playback refresh.
- [ ] Implement camera action only when device capability/permission exists.
- [ ] Add incident timeline with alarm type/severity/trip/location and explicit user action to request clip/live view.
- [ ] Ensure no continuous autoplay of all vehicles/cameras.
- [ ] Run tests/build and manual Control Tower scenario; expect PASS.
- [ ] Commit: `feat: add video incidents and on demand camera UX`.

### Task 5: Add retention/privacy controls

**Files:**
- Create: `src/lib/domain/video/retention.ts`
- Create: `src/lib/domain/video/__tests__/retention.test.ts`
- Create: `scripts/video-retention-cleanup.ts`
- Create: `src/app/(dashboard)/settings/video-privacy/page.tsx`
- Modify: `crontab`

**Interfaces:**
- Produces `evaluateVideoRetention(record, policy, now): RetentionDecision`.

- [ ] Write failing tests for incident retention, non-incident shorter retention, legal/audit hold, already-deleted media and policy change applying prospectively as configured.
- [ ] Implement retention evaluator and cleanup job with dry-run/idempotency.
- [ ] Build settings for retention days, allowed channels/roles, privacy notice/policy acknowledgement metadata.
- [ ] Schedule cleanup and verify dry-run before destructive mode.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add video privacy and retention controls`.

## Phase 5 Exit Gate

Configured camera devices expose their capabilities through the common telematics layer; authorized users can request live view/event playback from Control Tower; ADAS/DMS alarms create deduplicated incidents; all access is audited; and configurable retention/privacy controls exist without defaulting to continuous cloud recording.
