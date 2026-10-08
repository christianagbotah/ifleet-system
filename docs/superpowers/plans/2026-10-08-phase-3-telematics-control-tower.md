# Ghana Haulage OS Phase 3 — Telematics Control Tower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing phone-GPS/live-tracking foundation into a persistent, hardware-agnostic telematics layer with provider adapters, device registry, route intelligence and a production Control Tower.

**Architecture:** Preserve current `TruckLocation`, geofences, Socket.IO client and driver phone sender while placing them behind normalized telematics services. Device/vendor ingestion terminates at authenticated server adapters, writes durable normalized events, then broadcasts live state; UI consumes normalized state and never vendor packet formats.

**Tech Stack:** Next.js 16, TypeScript, Prisma/MariaDB, Socket.IO, Leaflet/React-Leaflet, Vitest, server-side HMAC/machine auth from Phase 0.

**Spec:** `docs/superpowers/specs/2026-10-07-ghana-haulage-os-design.md`

## Global Constraints

- Hardware vendor specifics do not leak into trip/business services or React components.
- Trusted-source order: hardwired GNSS > integrated MDVR > driver phone > manual.
- Device credentials are server-only.
- Location writes are durable before/with broadcast; in-memory Socket.IO state is not the source of truth.
- Phone GPS remains supported as fallback.
- Satellite view is only a map basemap mode.

## Review Focus

- Duplicate/out-of-order provider events must not corrupt latest vehicle state.
- Device clock drift must preserve both device time and received time.
- A tracker reassigned from one vehicle must not continue attributing new events to its previous installation.
- Offline tracker with fresh phone GPS must show fallback source/trust clearly rather than vehicle offline.
- Map/control-tower pages must tolerate hundreds of stale historical points without loading all raw history initially.

---

### Task 1: Add device registry and installation history

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/telematics/device-registry.ts`
- Create: `src/lib/domain/telematics/__tests__/device-registry.test.ts`
- Create: `src/app/api/telematics/devices/route.ts`
- Create: `src/app/api/telematics/devices/[id]/route.ts`
- Create: `src/app/(dashboard)/telematics/devices/page.tsx`

**Interfaces:**
- Produces `TelematicsDevice`, `DeviceInstallationHistory`.
- Produces `installDevice(input): InstallationDecision` and `resolveInstalledAsset(deviceId, at): AssetBinding | null`.

- [ ] Write failing tests for unique IMEI/serial, installation move, overlapping installation rejection, trailer/tractor binding and historical resolution.
- [ ] Run focused tests; expect FAIL.
- [ ] Add additive schema and registry service.
- [ ] Build device CRUD/install/uninstall APIs and page; store credential references only.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add telematics device registry`.

### Task 2: Define common provider adapter contract and normalized event model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/telematics/provider.ts`
- Create: `src/lib/domain/telematics/events.ts`
- Create: `src/lib/domain/telematics/providers/mobile-app.ts`
- Create: `src/lib/domain/telematics/__tests__/provider-contract.test.ts`
- Create: `src/lib/domain/telematics/__tests__/fixtures/mobile-location.json`

**Interfaces:**
- Produces `TelematicsProviderAdapter` methods: `normalizeLocation`, `normalizeIgnition`, `normalizeSensor`, `normalizeAlarm`, optional video methods, `healthCheck`.
- Produces normalized `LocationEventInput`, `SensorEventInput`, `AlarmEventInput` and durable models/references.

- [ ] Write provider contract suite asserting normalized coordinates, speed, heading, device/received timestamps, source/trust, raw-event reference and invalid-packet rejection.
- [ ] Run contract test; expect FAIL.
- [ ] Add normalized schema fields/events while maintaining compatibility with `TruckLocation` reads.
- [ ] Implement mobile-app adapter as first reference adapter using current driver location payload shape.
- [ ] Run contract suite; expect PASS.
- [ ] Commit: `feat: add normalized telematics provider contract`.

### Task 3: Build authenticated ingestion and durable live-state pipeline

**Files:**
- Create: `src/lib/domain/telematics/ingest.ts`
- Create: `src/lib/domain/telematics/__tests__/ingest.test.ts`
- Create: `src/app/api/telematics/ingest/[provider]/route.ts`
- Modify: `src/app/api/tracking/location/route.ts`
- Modify: `mini-services/tracking-service/index.ts`

**Interfaces:**
- Produces `ingestTelematicsEvent(adapter, requestContext, payload): Promise<IngestResult>`.
- Machine route uses Phase 0 auth/provider signature; phone route maps authenticated app payload through mobile adapter.

- [ ] Write failing tests for unknown device, invalid signature, duplicate provider event ID, out-of-order timestamp, valid event persistence and phone fallback.
- [ ] Run focused tests; expect FAIL.
- [ ] Implement idempotent durable ingest transaction resolving current installation/trip and storing normalized event.
- [ ] Refactor `/api/tracking/location` to use common ingest service for phone source while preserving existing client response shape.
- [ ] Refactor Socket.IO service so broadcasts carry normalized events and live requests can hydrate latest DB-backed state rather than rely exclusively on memory.
- [ ] Run tests/build plus tracking service health check; expect PASS.
- [ ] Commit: `feat: persist and normalize telematics ingestion`.

### Task 4: Add geofence polygons, route plans and deviation service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/routing/geofence.ts`
- Create: `src/lib/domain/routing/route-deviation.ts`
- Create: `src/lib/domain/routing/__tests__/routing.test.ts`
- Create: `src/app/api/routes/route.ts`
- Create: `src/app/api/routes/[id]/route.ts`

**Interfaces:**
- Produces polygon/circle geofence evaluation `evaluateGeofence(point, zone): GeofenceResult`.
- Produces `evaluateRouteDeviation(point, plannedRoute, toleranceMeters): RouteDeviationResult`.
- Adds `PlannedRoute`, `RouteDeviationEvent`; extends `GeofenceZone` with geometry representation.

- [ ] Write failing tests for circle/polygon entry/exit, boundary points, dwell, corridor tolerance and deviation recovery.
- [ ] Run focused tests; expect FAIL.
- [ ] Add schema and implement geometry helpers without introducing a message broker.
- [ ] Hook normalized location ingestion to create enter/exit/deviation events idempotently.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add route and polygon geofence intelligence`.

### Task 5: Build production Control Tower and route replay

**Files:**
- Modify: `src/components/tracking/LiveTrackingView.tsx`
- Create: `src/components/tracking/ControlTower.tsx`
- Create: `src/components/tracking/VehicleTelemetryDrawer.tsx`
- Create: `src/components/tracking/AlarmFeed.tsx`
- Create: `src/components/tracking/RouteReplay.tsx`
- Create: `src/app/(dashboard)/control-tower/page.tsx`
- Create: `src/app/api/telematics/live/route.ts`
- Create: `src/app/api/telematics/history/route.ts`

**Interfaces:**
- `GET /api/telematics/live` returns one normalized latest-state record per active asset, with source/trust/last-seen.
- `GET /api/telematics/history?tripId=&from=&to=&resolution=` returns bounded route points for replay.

- [ ] Write API/service tests asserting stale filtering, source fallback precedence, driver-role financial redaction and bounded history response.
- [ ] Implement live-state/history query services with indexes/pagination/aggregation-ready interface.
- [ ] Build Control Tower: full-screen map, active fleet panel, alarm feed, selected-vehicle drawer, road/terrain/satellite map mode abstraction, no hard-coded commercial map credential.
- [ ] Build route replay with time scrubber, stops/geofence/alerts overlay and selected trip only.
- [ ] Update existing tracking page/components to link into Control Tower rather than duplicate divergent business logic.
- [ ] Run tests/build and manually simulate tracker offline + phone fallback.
- [ ] Commit: `feat: add Ghana haulage telematics control tower`.

### Task 6: Add device health and retention/compaction jobs

**Files:**
- Create: `src/lib/domain/telematics/device-health.ts`
- Create: `src/lib/domain/telematics/__tests__/device-health.test.ts`
- Create: `src/app/api/telematics/health/route.ts`
- Create: `scripts/compact-location-history.ts`
- Modify: `crontab`

**Interfaces:**
- Produces `computeDeviceHealth(device, latestEvents, now): DeviceHealth`.
- Compactor accepts retention window and preserves trip summary/start/end/geofence/alarm points.

- [ ] Write failing tests for online/stale/offline/power-loss states and compaction preservation points.
- [ ] Implement health service and read API.
- [ ] Implement idempotent compaction script with dry-run mode; never delete un-compacted source until summary write succeeds.
- [ ] Schedule safe periodic execution and document retention variables.
- [ ] Run tests and dry-run against staging dataset; expect PASS/no destructive changes in dry-run.
- [ ] Commit: `feat: add telematics health and history retention`.

## Phase 3 Exit Gate

A registered hardwired device or driver phone can feed normalized durable location events, live state survives tracking-service restarts, control-room users can see source/trust/ETA/alerts and replay routes, geofence/route deviation events persist, and device health is measurable without vendor-specific logic leaking into UI/business domains.
