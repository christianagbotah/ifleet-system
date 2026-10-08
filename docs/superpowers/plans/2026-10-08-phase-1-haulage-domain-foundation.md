# Ghana Haulage OS Phase 1 — Haulage Domain Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the core Ghana haulage domain model—transporters/owners, tractor-trailer combinations, shipper profiles, load orders, contracts/rates and guarded trip lifecycle—without breaking existing trips.

**Architecture:** Extend the existing Prisma schema additively, preserve `Truck`, `Trip`, `ZoneRate` and current pages during migration, and introduce domain services under `src/lib/domain` so business rules stop living in route handlers/components. New screens consume new APIs while legacy screens remain functional until their reads are migrated.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7/MariaDB, Zod, React Query, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-ghana-haulage-os-design.md`

## Global Constraints

- No database reset or destructive migration.
- Tractor heads and trailers are separate first-class assets.
- A trip stores the actual tractor/trailer combination used.
- Shipper behavior is configuration, never brand-coded.
- `LoadOrder` is separate from `Trip` and may create multiple trips; initial trip points to one primary load order.
- Legacy `Truck`, `Trip`, `ZoneRate` reads must continue during rollout.
- Drivers must not receive margin/haulier settlement data.

## Review Focus

- Existing rigid-truck trips with no trailer must remain valid.
- Articulated trips must not assign an inactive/unavailable trailer or overlapping active coupling.
- Existing zone rates must migrate without changing historical trip revenue.
- Trip status changes outside the transition service must be rejected by new APIs.
- Load orders with multiple product lines and destination stops must retain quantities and order references exactly.

---

### Task 1: Add organization, transporter, vehicle-owner and contract/rate models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/haulage/types.ts`
- Create: `src/lib/domain/haulage/__tests__/rate-card.test.ts`
- Create: `src/lib/domain/haulage/rate-card.ts`
- Create: `scripts/backfill-haulage-foundation.ts`

**Interfaces:**
- Produces Prisma models `Organization`, `Transporter`, `VehicleOwner`, `TransportContract`, `TransportRateCard`.
- Produces `resolveTransportRate(input: RateResolutionInput): ResolvedTransportRate | null`.

- [ ] **Step 1: Write failing rate-resolution tests**

Cover exact-match shipper/loading point/destination/product/unit/date; effective-date precedence; fallback from specific to generic rule; inactive/expired rates ignored.

- [ ] **Step 2: Run focused tests**

Run: `bunx vitest run src/lib/domain/haulage/__tests__/rate-card.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add additive Prisma models/relations**

Add the five models plus nullable `transporterId`/`vehicleOwnerId` references on current `Truck`; do not delete `ZoneRate`.

- [ ] **Step 4: Implement rate resolver**

Keep it pure and database-independent; API/service callers provide candidate rate cards.

- [ ] **Step 5: Add idempotent backfill script**

Create a default internal transporter/owner for existing trucks, map active `ZoneRate` records into `TransportRateCard`, and record source IDs so reruns do not duplicate records.

- [ ] **Step 6: Verify migration/backfill on non-production DB**

Run: `bunx prisma validate && bunx prisma db push && bun scripts/backfill-haulage-foundation.ts && bun scripts/backfill-haulage-foundation.ts`
Expected: second backfill run creates zero duplicates.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/domain/haulage scripts/backfill-haulage-foundation.ts
git commit -m "feat: add haulage organizations contracts and rate cards"
```

### Task 2: Introduce trailer assets and coupling history

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/fleet-assets/trailer.ts`
- Create: `src/lib/domain/fleet-assets/coupling.ts`
- Create: `src/lib/domain/fleet-assets/__tests__/coupling.test.ts`
- Create: `src/app/api/trailers/route.ts`
- Create: `src/app/api/trailers/[id]/route.ts`
- Create: `src/app/(dashboard)/trailers/page.tsx`

**Interfaces:**
- Produces Prisma models `Trailer`, `TrailerCoupling` and nullable `Trip.trailerId`.
- Produces `validateCoupling(input: CouplingInput, activeCouplings: ActiveCoupling[]): CouplingValidationResult`.

- [ ] **Step 1: Write coupling tests**

Assert rigid trucks may have no trailer; inactive trailer blocks coupling; one trailer cannot be active on two tractors; decoupled historical combinations remain queryable.

- [ ] **Step 2: Run tests and confirm failure**

Run: `bunx vitest run src/lib/domain/fleet-assets/__tests__/coupling.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add trailer/coupling schema**

Fields follow the spec, including registration, type/body, axle data, tare/max payload, owner/transporter, status and timestamps.

- [ ] **Step 4: Implement domain validation and CRUD APIs**

API writes call validation helpers; return 409 for active-coupling conflicts.

- [ ] **Step 5: Build trailer management page**

List/filter/create/edit trailer assets and show current tractor/driver/trip combination without exposing unrelated finance.

- [ ] **Step 6: Verify**

Run: `bun run test && bun run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/domain/fleet-assets src/app/api/trailers src/app/(dashboard)/trailers
git commit -m "feat: add trailers and coupling history"
```

### Task 3: Add shipper profiles, loading-site configuration and load orders

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/orders/load-order.ts`
- Create: `src/lib/domain/orders/__tests__/load-order.test.ts`
- Create: `src/app/api/load-orders/route.ts`
- Create: `src/app/api/load-orders/[id]/route.ts`
- Create: `src/app/api/shipper-profiles/route.ts`
- Create: `src/app/(dashboard)/load-orders/page.tsx`
- Create: `src/app/(dashboard)/shipper-profiles/page.tsx`

**Interfaces:**
- Produces Prisma models `ShipperProfile`, `ShipperSiteRule`, `LoadOrder`, `LoadOrderLine`, `LoadOrderDestination`.
- Produces `validateLoadOrder(input: LoadOrderDraft): LoadOrderValidationResult` and `allocateLoadOrderQuantity(order, existingTrips): AllocationSummary`.

- [ ] **Step 1: Write order validation/allocation tests**

Cover cement bag/tonne products, FMCG multi-line/multi-drop order, partial allocation across multiple trips, over-allocation rejection and external-reference uniqueness per shipper.

- [ ] **Step 2: Run tests**

Run: `bunx vitest run src/lib/domain/orders/__tests__/load-order.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add schema models**

Store shipper rules as normalized fields plus JSON/Text only for extensible, non-query-critical settings. Add nullable `Trip.loadOrderId`.

- [ ] **Step 4: Implement order services/APIs**

POST validates lines/destinations and returns created order. PATCH enforces allowed order-state transitions. No factory brand names appear in business logic.

- [ ] **Step 5: Build management pages**

Load-order page supports manual entry now and reserves import actions for later connector work; shipper-profile page configures required docs, vehicle/trailer types, weighing/seal/POD rules.

- [ ] **Step 6: Verify**

Run: `bun run test && bun run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/domain/orders src/app/api/load-orders src/app/api/shipper-profiles src/app/(dashboard)/load-orders src/app/(dashboard)/shipper-profiles
git commit -m "feat: add shipper profiles and load orders"
```

### Task 4: Replace free-form trip status updates with guarded lifecycle service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/dispatch/trip-state-machine.ts`
- Create: `src/lib/domain/dispatch/__tests__/trip-state-machine.test.ts`
- Create: `src/lib/domain/dispatch/transition-trip.ts`
- Create: `src/app/api/trips/[id]/transition/route.ts`
- Modify: `src/app/api/trips/[id]/route.ts`
- Modify: `src/components/trips/DriverTripController.tsx`

**Interfaces:**
- Produces expanded `TripStatus` enum from spec.
- Produces `canTransition(from: TripStatus, to: TripStatus): TransitionDecision` and `transitionTrip(input: TransitionTripInput): Promise<TripTransitionResult>`.

- [ ] **Step 1: Write state-machine tests**

Assert legal canonical path, cancellation rules, delayed/exception-hold behavior, completed/reconciled terminal protections, and illegal skip from `scheduled` directly to `in_transit`.

- [ ] **Step 2: Run tests**

Run: `bunx vitest run src/lib/domain/dispatch/__tests__/trip-state-machine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Expand enum additively and map legacy states**

Provide migration mapping for current `departed_depot`, `offloaded`, `arrived_depot` values to new equivalents without deleting historical `TripEvent` records.

- [ ] **Step 4: Implement transition service**

Every successful transition persists `TripEvent` with actor/time/location/evidence metadata in one transaction.

- [ ] **Step 5: Lock API mutation path**

New APIs must reject direct `status` patching and instruct callers to use `/transition`; update driver controller to call transition API.

- [ ] **Step 6: Verify full trip regression**

Run: `bun run test && bun run build`
Expected: PASS; existing trip detail/list pages render legacy and new-state records.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/domain/dispatch src/app/api/trips/[id] src/components/trips/DriverTripController.tsx
git commit -m "feat: add guarded Ghana haulage trip lifecycle"
```

### Task 5: Add eligibility service and assignment API

**Files:**
- Create: `src/lib/domain/dispatch/eligibility.ts`
- Create: `src/lib/domain/dispatch/__tests__/eligibility.test.ts`
- Create: `src/app/api/load-orders/[id]/assign/route.ts`
- Create: `src/components/dispatch/AssignmentDialog.tsx`
- Create: `src/app/(dashboard)/dispatch/page.tsx`

**Interfaces:**
- Produces `evaluateAssignmentEligibility(input: EligibilityInput): EligibilityResult` with `blocking[]`, `warnings[]`, and `passed`.
- Assignment API consumes driver, tractor, optional trailer, shipper profile, maintenance/compliance/document data and creates/updates trip only when allowed or audited override is authorized.

- [ ] **Step 1: Write eligibility tests**

Cover suspended driver, expired licence, wrong licence class, expired roadworthy/insurance, maintenance block, inactive trailer, warning-only condition, rigid-truck no-trailer case and privileged override with reason.

- [ ] **Step 2: Run tests and confirm failure**

Run: `bunx vitest run src/lib/domain/dispatch/__tests__/eligibility.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement eligibility evaluator**

Pure evaluator returns structured result; no UI strings are used to make decisions.

- [ ] **Step 4: Implement assignment endpoint**

Run eligibility, validate available coupling, create/update trip, store assignment event and override audit when applicable.

- [ ] **Step 5: Build dispatch assignment UI**

Show candidates, blocking reasons/warnings and authorized override workflow. Never show margin data to driver-role users.

- [ ] **Step 6: Verify Phase 1 end-to-end scenario**

Test: create load order -> assign eligible driver/tractor/trailer -> trip enters `assigned`; invalid document blocks assignment.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/dispatch src/app/api/load-orders/[id]/assign src/components/dispatch src/app/(dashboard)/dispatch
git commit -m "feat: add eligibility-aware haulage dispatch"
```

## Phase 1 Exit Gate

A user can configure a shipper and rate, create a load order, manage trailers, assign an eligible driver + tractor + optional trailer, and move the resulting trip only through guarded lifecycle transitions; existing historical trips remain readable and no legacy tables are destructively removed.
