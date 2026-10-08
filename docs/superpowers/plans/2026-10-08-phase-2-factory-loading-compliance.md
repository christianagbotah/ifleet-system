# Ghana Haulage OS Phase 2 — Factory Loading & Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement gate/queue/loading/weighing/dispatch-clearance/e-waybill workflows and a versioned compliance engine suitable for Ghana factory/depot haulage.

**Architecture:** Extend current `DepotQueue`/`WeightVerification` concepts into site-aware operational records while retaining old reads. Keep legal/shipper limits in versioned server-side rules, evaluate dispatch clearance through a domain service, and make waybill finalization immutable/versioned.

**Tech Stack:** Next.js 16, TypeScript, Prisma/MariaDB, Zod, Vitest, shadcn/ui, jsPDF existing report layer.

**Spec:** `docs/superpowers/specs/2026-10-07-ghana-haulage-os-design.md`

## Global Constraints

- No legal/axle/speed/rest limit is hard-coded in frontend components.
- Weighing and compliance overrides require permission, reason and audit event.
- Gate-out cannot occur while dispatch clearance is blocking.
- Electronic waybill final versions are immutable; corrections supersede prior versions.
- Existing `DepotQueue`, `WeightVerification`, and waybill PDF behavior remains readable during migration.

## Review Focus

- Missing axle readings must behave according to the active shipper/rule-set requirement rather than silently pass.
- Overweight correction must allow a second weighing and clear the hold only when the latest required event passes.
- Duplicate gate scans must be idempotent within the same direction/event window.
- Rule-set effective dates must evaluate the rule active at trip/weighing time, not today's rule.
- Finalized waybill corrections must preserve the prior version and verification audit.

---

### Task 1: Add site-aware gate and queue operations

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/factory-ops/gate.ts`
- Create: `src/lib/domain/factory-ops/queue.ts`
- Create: `src/lib/domain/factory-ops/__tests__/gate-queue.test.ts`
- Create: `src/app/api/factory-ops/gate/route.ts`
- Create: `src/app/api/factory-ops/queue/route.ts`
- Create: `src/app/(dashboard)/factory-operations/page.tsx`

**Interfaces:**
- Produces `GateEvent`, site-aware queue fields/records, `recordGateEvent(input)` and `advanceQueue(input)`.

- [ ] Write failing tests for gate-in/gate-out sequence, duplicate scan idempotency, unauthorized vehicle rejection, queue arrival/call-to-bay/completion and detention duration.
- [ ] Run `bunx vitest run src/lib/domain/factory-ops/__tests__/gate-queue.test.ts`; expect FAIL.
- [ ] Add schema and implement pure validation/services; preserve legacy `DepotQueue` data via relation/mapping rather than deletion.
- [ ] Implement authenticated APIs with actor/location/evidence metadata.
- [ ] Build Factory Operations page with scheduled loads, gate queue, bay state and elapsed waiting time.
- [ ] Run `bun run test && bun run build`; expect PASS.
- [ ] Commit: `feat: add factory gate and queue operations`.

### Task 2: Add versioned compliance rule engine

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/compliance/types.ts`
- Create: `src/lib/domain/compliance/rule-engine.ts`
- Create: `src/lib/domain/compliance/__tests__/rule-engine.test.ts`
- Create: `src/app/api/compliance/rule-sets/route.ts`
- Create: `src/app/(dashboard)/compliance/rules/page.tsx`

**Interfaces:**
- Produces `ComplianceRuleSet`, `ComplianceRule`.
- Produces `evaluateCompliance(context: ComplianceContext, rules: ComplianceRule[]): ComplianceEvaluation`.

- [ ] Write failing tests covering effective dates, country/shipper/vehicle/trailer/commodity specificity, conflicting rules, blocking vs warning and historical evaluation.
- [ ] Run focused test; expect FAIL.
- [ ] Add schema with rule `type`, `scope`, `operator`, structured value/unit, severity, effectiveFrom/effectiveTo and priority.
- [ ] Implement deterministic precedence: most-specific active rule wins within rule type; equal specificity uses higher priority then latest effectiveFrom.
- [ ] Add rule-set CRUD UI/API with validation preventing overlapping ambiguous same-priority rules.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add versioned transport compliance rules`.

### Task 3: Expand weighing and axle verification

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/weighing/calculations.ts`
- Create: `src/lib/domain/weighing/clearance.ts`
- Create: `src/lib/domain/weighing/__tests__/weighing.test.ts`
- Create: `src/app/api/trips/[id]/weighings/route.ts`
- Create: `src/components/factory-ops/WeighingPanel.tsx`

**Interfaces:**
- Produces `WeighingEvent`, `AxleReading` and `evaluateWeightClearance(input: WeightClearanceInput): WeightClearanceResult`.

- [ ] Write failing tests for tare/gross/net math, negative net invalidation, per-axle/group exceedance, missing required axle data, tolerance rules, corrected second weighing and historical rule set.
- [ ] Run focused test; expect FAIL.
- [ ] Add additive schema; retain `WeightVerification` and optionally link/import it into weighing history.
- [ ] Implement calculation/clearance services using the compliance engine from Task 2.
- [ ] Implement trip weighing endpoint and panel including ticket/certificate/evidence fields.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add axle-aware weighing workflow`.

### Task 4: Add dispatch clearance service

**Files:**
- Create: `src/lib/domain/dispatch/clearance.ts`
- Create: `src/lib/domain/dispatch/__tests__/clearance.test.ts`
- Create: `src/app/api/trips/[id]/clearance/route.ts`
- Modify: `src/lib/domain/dispatch/trip-state-machine.ts`

**Interfaces:**
- Produces `evaluateDispatchClearance(input: DispatchClearanceInput): DispatchClearanceResult` with checks for assignment eligibility, required gate/queue/weighing/documents/seal/compliance.

- [ ] Write failing tests for fully cleared trip, overweight block, missing waybill/doc block, warning-only rule, privileged override and corrected weighing recovery.
- [ ] Run focused tests; expect FAIL.
- [ ] Implement clearance aggregation without duplicating individual rule logic.
- [ ] Guard transition into `departed_loading_point` so clearance must pass.
- [ ] Add API returning structured checks for UI and audit-safe override endpoint behavior.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: enforce dispatch clearance before gate-out`.

### Task 5: Upgrade waybill to immutable electronic waybill

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/waybills/electronic-waybill.ts`
- Create: `src/lib/domain/waybills/__tests__/electronic-waybill.test.ts`
- Create: `src/app/api/trips/[id]/waybill/route.ts`
- Create: `src/app/verify/waybill/[token]/page.tsx`
- Modify: `src/lib/reports/waybill-pdf.ts`

**Interfaces:**
- Produces `ElectronicWaybill`, `ElectronicWaybillVersion`, `WaybillSeal`.
- Produces `finalizeWaybill(input): FinalizedWaybill` and `supersedeWaybill(previousId, correction): FinalizedWaybill`.

- [ ] Write failing tests for unique numbering/token, immutable finalized record, superseding correction, least-information public verification view and tractor/trailer/product/weight consistency.
- [ ] Run focused tests; expect FAIL.
- [ ] Add schema and implement finalization/versioning services.
- [ ] Implement QR verification token route/page exposing only safe shipment fields.
- [ ] Update PDF generation to render electronic version, QR token, tractor/trailer, weights, seals and version indicator.
- [ ] Wire clearance requirement based on shipper profile.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add immutable electronic waybills`.

## Phase 2 Exit Gate

An assigned trip can gate in, queue, record tare/gross/axle weights, evaluate applicable Ghana/shipper compliance rules, finalize a versioned e-waybill, pass dispatch clearance and gate out. Overweight/missing-document scenarios remain blocked with auditable correction/override paths.
