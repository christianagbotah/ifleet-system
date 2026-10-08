# Ghana Haulage OS — Cross-Cutting Integrations, Event Ledger, Reporting & Core UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete cross-cutting capabilities required by the architecture but shared across multiple phases: integration metadata/imports, durable operational events, unified Operations Dashboard/Trip Workspace, complete reporting families and broader offline driver evidence sync.

**Architecture:** These tasks consume stable domain interfaces from Phases 0–4 and must not duplicate their business rules. Integrations normalize external instructions into existing `LoadOrder`/domain services; reports read authoritative domain facts; the event ledger is append-only and powers the Trip Workspace timeline/audit surfaces.

**Tech Stack:** Next.js 16, TypeScript, Prisma/MariaDB, Zod, ExcelJS/PapaParse already in repo, Vitest, React Query, shadcn/ui, existing report history/export utilities.

**Spec:** `docs/superpowers/specs/2026-10-07-ghana-haulage-os-design.md`

## Global Constraints

- External factory/shipper formats never bypass load-order/domain validation.
- Integration secret values are referenced from server secret storage, not stored in DB/source.
- Operational events are append-only; correction creates a new event/reference.
- Dashboards/reports consume domain services/read models rather than reimplement business formulas.
- Role-based finance visibility applies to dashboard, exports and reports as well as APIs.
- Offline mutations use stable client IDs and idempotent server endpoints.

## Review Focus

- Re-importing the same factory CSV/API payload must be idempotent.
- Malformed/partial import rows must report row-level errors without silently dropping valid rows.
- Event ordering must preserve received time and occurred time for delayed/offline events.
- Report exports must use the same filters/totals as on-screen reports.
- Driver offline queue must not upload a POD before dependent photos/evidence are successfully stored when policy requires them.

---

### Task 1: Add integration connection metadata and secret-reference model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/integrations/connection.ts`
- Create: `src/lib/domain/integrations/__tests__/connection.test.ts`
- Create: `src/app/api/integrations/connections/route.ts`
- Create: `src/app/(dashboard)/settings/integrations/page.tsx`

**Interfaces:**
- Produces `IntegrationConnection` with provider/type, non-secret config, `secretRef`, status, lastSuccessAt/lastErrorAt.
- Produces `validateIntegrationConnection(input): ValidationResult`.

- [ ] Write failing tests ensuring raw secret/token/password values are rejected from persisted config and safe secret references are accepted.
- [ ] Add additive schema and service.
- [ ] Build permission-gated CRUD/status API/page; response never returns secret material.
- [ ] Audit connection config changes.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add secure integration connection registry`.

### Task 2: Add load-order CSV/Excel/API/webhook ingestion

**Files:**
- Create: `src/lib/domain/integrations/load-order-import.ts`
- Create: `src/lib/domain/integrations/__tests__/load-order-import.test.ts`
- Create: `src/app/api/load-orders/import/route.ts`
- Create: `src/app/api/integrations/load-orders/[connectionId]/webhook/route.ts`
- Create: `src/components/load-orders/ImportLoadOrdersDialog.tsx`

**Interfaces:**
- Produces `normalizeExternalLoadOrder(row, mapping): LoadOrderDraft` and `importLoadOrders(batch): ImportResult`.
- All accepted records are created through Phase 1 `validateLoadOrder`/service.

- [ ] Write failing tests for CSV, XLSX-style parsed rows, duplicate external reference, mixed valid/invalid rows, unit mapping, multi-destination mapping and webhook idempotency key.
- [ ] Implement mapping/normalization; use PapaParse/ExcelJS only at file parsing edge.
- [ ] Implement import endpoint returning accepted count plus row-level errors and stable import batch ID.
- [ ] Implement authenticated webhook route using integration/machine auth and same idempotent importer.
- [ ] Add import dialog with downloadable mapping template generated from configured shipper profile fields.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add load order imports and integration webhook`.

### Task 3: Add durable operational event ledger

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/events/operational-event.ts`
- Create: `src/lib/domain/events/__tests__/operational-event.test.ts`
- Create: `src/app/api/trips/[id]/timeline/route.ts`

**Interfaces:**
- Produces `OperationalEvent` fields: eventKey/idempotencyKey, type, entityType/id, tripId, actor, occurredAt, receivedAt, location/evidence refs, metadata, source.
- Produces `appendOperationalEvent(input): Promise<AppendEventResult>`.

- [ ] Write failing tests for append, duplicate idempotency key, delayed/offline occurredAt vs receivedAt, correction/supersession link and actor/source metadata.
- [ ] Add append-only schema/indexes.
- [ ] Implement event writer and adapters from major phase services (`load_order.created`, `trip.assigned`, gate/queue/weighing/waybill/departure/position/geofence/deviation/POD/reconciliation/settlement).
- [ ] Add timeline API ordered by occurredAt then receivedAt, preserving event source/type.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add haulage operational event ledger`.

### Task 4: Build unified Operations Dashboard and Trip Workspace

**Files:**
- Create: `src/app/(dashboard)/operations/page.tsx`
- Create: `src/components/operations/OperationsKpis.tsx`
- Create: `src/components/operations/OperationalStatusBoard.tsx`
- Modify/Create: trip detail route/page to include `src/components/trips/TripWorkspace.tsx`
- Create: `src/components/trips/TripTimeline.tsx`

**Interfaces:**
- Operations read model exposes counts for active/inactive/maintenance trucks, active loads, factory/queue/loading/in-transit/delivering/delayed/exception, today's tonnage/trips, outstanding POD and awaiting reconciliation.
- Trip Workspace consumes operational timeline + commercial/telemetry/delivery/financial permission-filtered panels.

- [ ] Write read-model tests for status counts, tonnage, outstanding POD and financial redaction.
- [ ] Implement one server read model used by cards/board rather than per-widget queries.
- [ ] Build status board where drag actions call guarded Phase 1 transition service only when allowed.
- [ ] Build Trip Workspace timeline combining operational event ledger with tab/panels for assignment, load, factory, route, delivery, expenses/reconciliation and allowed finance.
- [ ] Verify mobile/tablet layouts and role visibility.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add operations dashboard and unified trip workspace`.

### Task 5: Implement complete report families with shared filters/export

**Files:**
- Create: `src/lib/domain/reports/haulage-reports.ts`
- Create: `src/lib/domain/reports/__tests__/haulage-reports.test.ts`
- Modify: `src/lib/reports/report-data.ts`
- Create: `src/app/(dashboard)/reports/haulage/page.tsx`
- Create/extend export API under `src/app/api/reports/`

**Interfaces:**
- Produces typed report queries for trip operations, utilization, route, shipper/customer, loading wait, driver/safety, fuel, maintenance, compliance, weight/overload, POD exceptions, revenue/cost/margin, haulier settlement, driver settlement, device health.

- [ ] Write failing tests for date/shipper/transporter/vehicle/driver/route filters, screen/export total parity and finance-field redaction.
- [ ] Implement report query/read-model layer using authoritative domain facts.
- [ ] Build report page with consistent filter bar, table/chart sections and CSV/XLSX/PDF where existing export infrastructure supports it.
- [ ] Persist `ReportHistory` success/failure/parameters without secret data.
- [ ] Verify export totals match on-screen result set for representative reports.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add Ghana haulage operational and financial reporting`.

### Task 6: Expand driver offline outbox to inspection/status/photo dependencies

**Files:**
- Modify: `src/lib/offline/driver-outbox.ts`
- Modify: `src/lib/offline/__tests__/driver-outbox.test.ts`
- Modify: `src/components/driver/OfflineSyncStatus.tsx`
- Modify: driver inspection/status/evidence forms discovered during implementation

**Interfaces:**
- Adds dependency graph support to existing `enqueueDriverMutation` entries: `dependsOn: string[]`, payload/evidence references and retry classification.

- [ ] Add failing tests for pre-trip inspection offline, status event with photo dependency, receipt upload then expense submit, permanent 4xx validation failure and retryable network/5xx failure.
- [ ] Implement dependency-aware flush; dependent mutation waits until required upload IDs are acknowledged.
- [ ] Integrate trip status, inspections, photos and receipts in addition to Phase 4 POD/expense queue.
- [ ] Simulate offline full driver workflow through reconnect and verify each mutation appears once server-side.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: complete offline driver operations outbox`.

## Cross-Cutting Exit Gate

Factory/customer instructions can enter through manual, CSV/Excel or authenticated webhook paths into the same validated load-order domain; major actions produce durable operational events; managers have a unified Operations Dashboard and Trip Workspace; all required report families share authoritative filters/totals; and driver inspections/status/photos/receipts/POD can survive temporary connectivity loss without duplication.
