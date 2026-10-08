# Ghana Haulage OS Phase 4 — Delivery & Financial Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the operational/financial loop from destination arrival through ePOD, delivery exceptions, trip reconciliation, driver settlement, haulier settlement, invoicing and real trip profitability.

**Architecture:** Add append-oriented delivery evidence and reconciliation records tied to trip/destination. Reuse existing cash advances, fuel, expenses, tolls, driver wallet/settlement and invoice foundations while calculating third-party haulier settlement separately from driver pay.

**Tech Stack:** Next.js 16, TypeScript, Prisma/MariaDB, Zod, Vitest, React Query, shadcn/ui, existing upload/report utilities.

**Spec:** `docs/superpowers/specs/2026-10-07-ghana-haulage-os-design.md`

## Global Constraints

- Multi-drop trips require a POD at each required destination.
- Delivery evidence is append-oriented; corrections are auditable.
- Quantity discrepancies create a delivery exception instead of silently changing dispatch quantities.
- A trip cannot reach `reconciled` while blocking financial exceptions remain.
- Haulier settlement is distinct from driver settlement/payroll.
- Profitability data is permission-controlled and never exposed to driver-role APIs.

## Review Focus

- Offline/retried POD submission must be idempotent and never create duplicate receipt quantities.
- Shortage/damage totals must reconcile dispatched, received, rejected and damaged quantities without negative quantities.
- Reconciliation must not double-count expenses already represented by fuel/toll/advance records.
- Third-party owner and transporter can differ; settlement payee must follow contract/assignment configuration.
- Reopening/correcting a POD or expense after settlement approval must create a blocking adjustment workflow rather than silently rewriting paid history.

---

### Task 1: Add proof-of-delivery and delivery exception domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/delivery/pod.ts`
- Create: `src/lib/domain/delivery/__tests__/pod.test.ts`
- Create: `src/app/api/trips/[id]/destinations/[destinationId]/pod/route.ts`
- Create: `src/components/delivery/ProofOfDeliveryForm.tsx`
- Modify: `src/components/trips/DriverTripController.tsx`

**Interfaces:**
- Produces `ProofOfDelivery`, `ProofOfDeliveryEvidence`, `DeliveryException`.
- Produces `validatePod(input: PodInput, dispatch: DispatchQuantity): PodValidationResult` and `deriveDeliveryException(...)`.

- [ ] Write failing tests for exact delivery, shortage, damage/rejection, invalid negative/over-received values, multi-drop independence and duplicate client submission ID.
- [ ] Run focused test; expect FAIL.
- [ ] Add schema with server-generated immutable evidence timestamps plus client submission ID for idempotency.
- [ ] Implement validation, exception creation and POD endpoint in one transaction.
- [ ] Add driver POD form supporting receiver name/phone, OTP/PIN or QR confirmation hooks, signature/photos/doc photos, GPS and offline-ready client submission IDs.
- [ ] Guard transition to `delivered` until required destinations have POD.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add verified proof of delivery workflow`.

### Task 2: Add trip reconciliation service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/reconciliation/reconcile-trip.ts`
- Create: `src/lib/domain/reconciliation/__tests__/reconcile-trip.test.ts`
- Create: `src/app/api/trips/[id]/reconciliation/route.ts`
- Create: `src/components/reconciliation/TripReconciliationPanel.tsx`

**Interfaces:**
- Produces `TripReconciliation`, `ReconciliationLine`, `ReconciliationException`.
- Produces `buildReconciliationSnapshot(input: ReconciliationInput): ReconciliationSnapshot` and `canFinalizeReconciliation(snapshot): Decision`.

- [ ] Write failing tests for fuel/toll/expense/advance aggregation, duplicate-reference de-duplication, unresolved delivery exception, approved adjustment and final totals.
- [ ] Run focused tests; expect FAIL.
- [ ] Add additive schema; source lines keep originating entity type/id for audit and de-duplication.
- [ ] Implement snapshot builder and approval/finalization endpoint.
- [ ] Build reconciliation panel with expected-vs-actual, evidence links and blocking exception summary.
- [ ] Wire successful approval to guarded `reconciled` transition.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add trip reconciliation and exception closure`.

### Task 3: Improve driver settlement integration

**Files:**
- Create: `src/lib/domain/settlements/driver-settlement.ts`
- Create: `src/lib/domain/settlements/__tests__/driver-settlement.test.ts`
- Modify: existing driver settlement API/page files discovered during implementation

**Interfaces:**
- Produces `calculateDriverSettlement(input: DriverSettlementInput): DriverSettlementCalculation` using reconciled trips only unless explicitly approved policy says otherwise.

- [ ] Write failing tests for trip bonus/allowance, advance deductions, rejected/unapproved expenses, duplicate trip lines and already-settled trip exclusion.
- [ ] Implement calculator and integrate with current `DriverSettlement`/`SettlementLine` models without deleting historical records.
- [ ] Require settlement snapshot/version before approval and preserve paid history.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: tie driver settlement to reconciled trips`.

### Task 4: Add haulier/vehicle-owner settlement

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/settlements/haulier-settlement.ts`
- Create: `src/lib/domain/settlements/__tests__/haulier-settlement.test.ts`
- Create: `src/app/api/haulier-settlements/route.ts`
- Create: `src/app/api/haulier-settlements/[id]/route.ts`
- Create: `src/app/(dashboard)/haulier-settlements/page.tsx`

**Interfaces:**
- Produces `HaulierSettlement`, `HaulierSettlementLine`.
- Produces `calculateHaulierSettlement(input, rateCard): HaulierSettlementCalculation`.

- [ ] Write failing tests for per-trip/tonne/bag/pallet rates, detention, approved extras, shortage deduction, fuel adjustment, tax/withholding, advance already paid and owner-vs-transporter payee selection.
- [ ] Run focused tests; expect FAIL.
- [ ] Add schema and calculator using Phase 1 rate-card output and Phase 4 reconciled trip facts.
- [ ] Implement draft/approve/pay lifecycle APIs with immutable paid snapshot.
- [ ] Build haulier settlement page with permission-gated finance details.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add third-party haulier settlements`.

### Task 5: Add authoritative trip profitability service and finance dashboard

**Files:**
- Create: `src/lib/domain/billing/trip-profitability.ts`
- Create: `src/lib/domain/billing/__tests__/trip-profitability.test.ts`
- Create: `src/app/api/analytics/trip-profitability/route.ts`
- Create: `src/app/(dashboard)/analytics/profitability/page.tsx`
- Modify: invoice generation/service files discovered during implementation

**Interfaces:**
- Produces `calculateTripProfitability(input: TripFinancialFacts): TripProfitability` with revenue, haulier, fuel, driver, toll/fees, maintenance allocation, other direct cost, shortage/damage impact, contribution and margin percentage.

- [ ] Write failing tests for internal fleet, subcontracted fleet, zero revenue, negative contribution, maintenance allocation disabled/enabled and post-settlement correction adjustment.
- [ ] Implement pure profitability calculator and permission-gated API.
- [ ] Ensure invoice creation references finalized commercial quantities/rates without re-keying operational information.
- [ ] Build finance dashboard for margin by trip/route/customer/vehicle plus cost/km and empty-return metrics available from data.
- [ ] Verify driver-role request is forbidden/redacted.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add trip profitability and financial closure analytics`.

### Task 6: Add driver offline submission queue for POD/expenses/status evidence

**Files:**
- Create: `src/lib/offline/driver-outbox.ts`
- Create: `src/lib/offline/__tests__/driver-outbox.test.ts`
- Create: `src/components/driver/OfflineSyncStatus.tsx`
- Modify: driver submission components for POD, expense/fuel and status transitions

**Interfaces:**
- Produces `enqueueDriverMutation`, `flushDriverOutbox`, and stable `clientMutationId` semantics.

- [ ] Write failing tests for queue while offline, ordered retry, duplicate server acknowledgement, permanent validation error and photo upload dependency.
- [ ] Implement IndexedDB-backed outbox behind a small interface; tests use in-memory adapter.
- [ ] Add sync status UI and retry behavior; immutable events are appended, not destructive overwrite.
- [ ] Verify simulated offline POD and expense submit sync once after reconnection.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add offline driver evidence synchronization`.

## Phase 4 Exit Gate

A multi-drop trip can complete verified POD at each stop, create/resolve shortage/damage exceptions, reconcile all trip costs, settle driver and subcontracted haulier separately, create the customer invoice from finalized operational data, and display permission-controlled real trip contribution/margin. Offline driver submissions synchronize idempotently.
