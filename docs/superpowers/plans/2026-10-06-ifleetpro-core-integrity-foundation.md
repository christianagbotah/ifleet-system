# iFleetPro Core Integrity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make iFleetPro’s production foundation trustworthy by securing configuration, introducing deterministic tests/CI, making trip creation concurrency-safe and transactional, enforcing odometer continuity, reconciling multi-fill fuel correctly, fixing weighbridge status integrity, and replacing unsafe production schema pushes with versioned migrations.

**Architecture:** Preserve the existing Next.js 16 + Prisma + MariaDB application, but move business-critical calculations into small deterministic domain modules and transactional services. API routes become thin validation/authorization adapters. Summary fields on `Trip` and `Truck` remain compatibility projections but are recalculated from authoritative ledger/event records rather than overwritten ad hoc.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, React 19, Prisma 7.8 with `@prisma/adapter-mariadb`, MariaDB, Bun runtime/test runner, Zod v4, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-06-ifleetpro-core-integrity-ai-design.md`

## Global Constraints

- Preserve the existing product; do not rewrite the application.
- Money fields remain Prisma `Decimal`; convert to JS numbers only at API/report boundaries where required.
- MariaDB/MySQL is the canonical database provider in all environments for this plan; do not patch the Prisma provider during deployment.
- Never commit credentials, API keys, webhook secrets, production connection strings, or customer/driver production data.
- The production database must not be the default developer database.
- `Truck.currentMileage`, `Trip.totalMileage`, `Trip.fuelUsed`, and `Trip.fuelCost` are compatibility projections, not independent sources of truth.
- A normal odometer observation may not decrease from the latest verified reading. Corrections require an explicit adjustment path and audit reason.
- A fuel event linked to a trip must use that trip’s assigned truck unless a privileged correction workflow explicitly overrides it.
- A multi-fill trip must aggregate all eligible fuel events; no individual fuel record may overwrite trip fuel totals.
- AI is out of the execution path for these calculations; this foundation must be fully deterministic.
- Critical workflows must fail atomically: no partial trip creation, fuel posting, or mileage projection updates.
- Use TDD for every business-rule task and commit after each task.

## Review Focus

1. **Concurrent trip creation:** two dispatchers creating trips at the same time must receive unique trip numbers without duplicate-key races.
2. **Odometer rollback/incorrect truck:** lower readings or readings attached to the wrong trip truck must be rejected without mutating projections.
3. **Multiple fuel fills and duplicate evidence:** two legitimate fills must sum; duplicate/near-duplicate submissions must not double-charge the trip.
4. **Partial transaction failure:** a failure while creating nested trip data or posting fuel must roll back all writes in that unit of work.
5. **Weight variance boundaries:** exactly ±5% is not a variance flag; values beyond ±5% use the canonical `variance_detected` status and signed classification.

---

## Delivery boundaries

This plan implements the first executable slice of the approved architecture. Follow-on plans will separately implement:

- driver mobile trip execution + POD/offline sync;
- trip finance/settlement and full profitability allocation;
- advanced analytics dashboards;
- AI dispatch copilot;
- fuel anomaly/theft intelligence;
- predictive maintenance;
- route/ETA intelligence;
- driver safety/efficiency scoring;
- document/waybill intelligence;
- management copilot and forecasting.

Those later plans depend on this plan’s authoritative fuel, mileage, transaction and CI foundations.

---

### Task 1: Secure environment and repository hygiene

**Files:**
- Modify: `.gitignore`
- Modify: `src/lib/db.ts`
- Create: `.env.example`
- Modify: `agent-ctx/KNOWLEDGE-BASE.md`
- Delete: `prisma/db/custom.db`
- Test: `src/lib/config/database-url.test.ts`

**Interfaces:**
- Produces: `getDatabaseUrl(env: NodeJS.ProcessEnv): string` in `src/lib/config/database-url.ts`.
- Produces: explicit required env contract for `DATABASE_URL`, `NEXTAUTH_SECRET`, and service secrets.
- Deployment prerequisite: operator must rotate every credential/webhook/API secret that has ever been committed before production rollout.

- [ ] **Step 1: Write the failing database URL tests**

Create `src/lib/config/database-url.test.ts` with tests asserting:
- `getDatabaseUrl({ DATABASE_URL: 'mariadb://user:pass@localhost:3306/ifleet_test' })` returns that value.
- missing/blank `DATABASE_URL` throws `DATABASE_URL is required`.
- a production URL is not read from a repository `.env` file by helper code.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun test src/lib/config/database-url.test.ts`
Expected: FAIL because `src/lib/config/database-url.ts` does not exist.

- [ ] **Step 3: Implement environment-only database configuration**

Create `src/lib/config/database-url.ts` exporting:

```ts
export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string
```

It must trim `DATABASE_URL`, throw when absent, and convert a leading `mysql://` to `mariadb://` only for the MariaDB adapter.

Update `src/lib/db.ts` to call `getDatabaseUrl()` and remove direct filesystem `.env` parsing and default database-name fallbacks that can silently point to production.

- [ ] **Step 4: Remove tracked sensitive/legacy artifacts**

- Delete `prisma/db/custom.db` from git.
- Add `prisma/db/`, `*.db`, `*.sqlite`, and `*.sqlite3` to `.gitignore`.
- Redact all literal connection credentials, server secrets, webhook secrets, and token-like values from `agent-ctx/KNOWLEDGE-BASE.md`; replace with environment-variable names and operational instructions.
- Create `.env.example` containing placeholders only.

- [ ] **Step 5: Verify secret hygiene and tests**

Run:
- `bun test src/lib/config/database-url.test.ts`
- `git grep -nE '(DATABASE_URL=.*://[^<][^ ]*:[^@]+@|webhook secret|API[_ -]?KEY=.*[^<])' -- ':!bun.lock' || true`

Expected: test PASS; grep returns no live credential values.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.example src/lib/db.ts src/lib/config/database-url.ts src/lib/config/database-url.test.ts agent-ctx/KNOWLEDGE-BASE.md
git rm prisma/db/custom.db
git commit -m "security: isolate database configuration and remove tracked secrets"
```

---

### Task 2: Establish deterministic test/check pipeline and CI

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/ci.yml`
- Create: `scripts/ci/check-no-secrets.sh`
- Test: existing/new `*.test.ts` files via Bun.

**Interfaces:**
- Produces npm/Bun scripts: `test`, `typecheck`, `check`, `prisma:validate`.
- Produces CI gate executed on pull requests and pushes to `main`.

- [ ] **Step 1: Add package scripts**

Add exactly:

```json
"test": "bun test",
"typecheck": "tsc --noEmit",
"prisma:validate": "prisma validate",
"check": "bun run lint && bun run typecheck && bun run test && bun run prisma:validate"
```

Keep existing scripts intact.

- [ ] **Step 2: Add repository secret-pattern check**

Create `scripts/ci/check-no-secrets.sh` that fails on tracked production-style database URLs and known secret assignment patterns while allowing placeholders in `.env.example`.

- [ ] **Step 3: Create GitHub Actions CI workflow**

Create `.github/workflows/ci.yml` using `actions/checkout@v4` and `oven-sh/setup-bun@v2`, then:
- `bun install --frozen-lockfile`
- `bash scripts/ci/check-no-secrets.sh`
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bunx prisma validate`
- `bun run build`

Set only placeholder/non-production environment values needed for static validation/build.

- [ ] **Step 4: Verify locally**

Run: `bun run check`
Expected: PASS after Task 1 tests.

Run: `bun run build`
Expected: Next.js build exits 0 without connecting to production DB.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/ci.yml scripts/ci/check-no-secrets.sh
git commit -m "ci: add deterministic quality and secret gates"
```

---

### Task 3: Add versioned schema foundation for sequences, odometer ledger, fuel metadata and reconciliation

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_core_integrity_foundation/migration.sql`
- Test: `src/lib/domain/schema-contract.test.ts`

**Interfaces:**
- Produces Prisma models/enums used by Tasks 4–8.
- Produces `TripSequence`, `OdometerReading`, and `TripReconciliation` models.
- Extends `FuelLog` as the authoritative fuel-event record for this phase rather than creating a parallel fuel table.

- [ ] **Step 1: Write schema contract tests**

Create `src/lib/domain/schema-contract.test.ts` that reads `prisma/schema.prisma` and asserts presence of:
- `model TripSequence` with unique `year` and integer `lastValue`;
- `model OdometerReading` with `truckId`, optional `tripId`, `reading`, `recordedAt`, `readingType`, `source`, `verificationStatus`, `evidence`, `capturedBy`, `adjustmentReason`, and optional predecessor/supersedes reference;
- `model TripReconciliation` with a unique `tripId` and frozen mileage/fuel/cost metrics;
- fuel event metadata fields on `FuelLog`: `eventType`, `source`, `verificationStatus`, `capturedBy`, `latitude`, `longitude`, `paymentSource`, and `reversalOfId` or equivalent self-reference;
- canonical weight variance classification support.

- [ ] **Step 2: Run the schema contract test and verify it fails**

Run: `bun test src/lib/domain/schema-contract.test.ts`
Expected: FAIL on missing models/fields.

- [ ] **Step 3: Update Prisma schema**

Add enums:
- `OdometerReadingType`: `trip_start`, `trip_end`, `fuel`, `maintenance`, `inspection`, `manual_adjustment`, `import`.
- `ObservationSource`: `manual`, `driver_app`, `admin`, `gps`, `import`, `integration`, `system`.
- `VerificationStatus`: `pending`, `verified`, `rejected`, `superseded`.
- `FuelEventType`: `purchase`, `company_issue`, `external_issue`, `emergency`, `tank_observation`, `reversal`.
- `WeightVarianceClass`: `within_tolerance`, `over`, `under`.

Keep `WeightVerificationStatus` canonical as `pending`, `verified`, `failed`, `variance_detected`.

Add the models/relations described in Step 1 and indexes on truck/date, trip/date, and verification state.

- [ ] **Step 4: Generate and inspect migration**

Run:
- `bunx prisma format`
- `bunx prisma migrate dev --name core_integrity_foundation --create-only`
- `bunx prisma validate`

Expected: migration SQL is generated; schema validates; no destructive drop of existing Trip/FuelLog data.

- [ ] **Step 5: Run contract test**

Run: `bun test src/lib/domain/schema-contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/domain/schema-contract.test.ts
git commit -m "feat: add core integrity ledger schema"
```

---

### Task 4: Implement pure odometer validation and transactional odometer service

**Files:**
- Create: `src/lib/domain/odometer/validation.ts`
- Create: `src/lib/domain/odometer/validation.test.ts`
- Create: `src/lib/services/odometer-service.ts`
- Test: `src/lib/services/odometer-service.test.ts`

**Interfaces:**
- Produces:

```ts
export type OdometerValidationInput = {
  latestVerifiedReading: number | null
  tripStartReading?: number | null
  candidateReading: number
  readingType: 'trip_start' | 'trip_end' | 'fuel' | 'maintenance' | 'inspection' | 'manual_adjustment' | 'import'
  allowAdjustment?: boolean
}

export function validateOdometerReading(input: OdometerValidationInput): { valid: true } | { valid: false; code: string; message: string }

export async function recordOdometerReading(input: RecordOdometerInput, tx?: Prisma.TransactionClient): Promise<OdometerReading>
```

- `recordOdometerReading` updates `Truck.currentMileage` only when a reading becomes verified and newer than the current verified projection.

- [ ] **Step 1: Write failing pure validation tests**

Tests must assert:
- `100500` after `100000` is valid.
- `99999` after `100000` is rejected with code `ODOMETER_ROLLBACK`.
- trip end below trip start is rejected with `END_BEFORE_START`.
- equal reading is permitted for non-trip-end observations.
- `manual_adjustment` with `allowAdjustment: true` may supersede a bad prior reading but requires an adjustment reason at service level.

- [ ] **Step 2: Run focused test and verify it fails**

Run: `bun test src/lib/domain/odometer/validation.test.ts`
Expected: FAIL because implementation is missing.

- [ ] **Step 3: Implement `validateOdometerReading`**

Keep it pure: no Prisma calls, no dates, no logging.

- [ ] **Step 4: Write service tests with a transaction-client stub**

Assert:
- wrong trip/truck association fails before create;
- rejected reading creates no row and does not update truck projection;
- verified trip-end reading creates ledger row and updates truck projection in the same transaction;
- a simulated projection-update failure rolls back/propagates rather than swallowing the error.

- [ ] **Step 5: Implement `recordOdometerReading`**

Fetch latest verified reading and trip truck inside the supplied transaction, call the pure validator, create the ledger row, and update compatibility projections atomically.

- [ ] **Step 6: Run odometer tests**

Run: `bun test src/lib/domain/odometer src/lib/services/odometer-service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/odometer src/lib/services/odometer-service.ts src/lib/services/odometer-service.test.ts
git commit -m "feat: enforce authoritative odometer continuity"
```

---

### Task 5: Implement deterministic fuel reconciliation calculations

**Files:**
- Create: `src/lib/domain/fuel/reconciliation.ts`
- Create: `src/lib/domain/fuel/reconciliation.test.ts`

**Interfaces:**
- Produces:

```ts
export type FuelEventInput = {
  liters: number
  totalCost: number
  eventType: 'purchase' | 'company_issue' | 'external_issue' | 'emergency' | 'reversal'
}

export type FuelReconciliationInput = {
  distanceKm: number | null
  openingTankLiters: number | null
  closingTankLiters: number | null
  events: FuelEventInput[]
}

export type FuelReconciliationResult = {
  fuelAddedLiters: number
  fuelCost: number
  consumedLiters: number | null
  consumptionBasis: 'tank_reconciled' | 'fuel_added' | 'unavailable'
  kmPerLiter: number | null
  litersPer100Km: number | null
  fuelCostPerKm: number | null
}

export function reconcileFuel(input: FuelReconciliationInput): FuelReconciliationResult
```

- [ ] **Step 1: Write failing reconciliation tests**

Tests must pin:
- two fills of 100 L + 40 L produce `fuelAddedLiters = 140` and summed cost;
- a reversal subtracts its litres/cost;
- opening 80 L + added 140 L - closing 60 L produces 160 L consumed;
- 800 km / 160 L produces 5 km/L and 20 L/100 km;
- zero/negative distance produces null efficiency metrics, never Infinity/NaN;
- no tank observations uses `fuel_added` basis;
- no usable litres uses `unavailable`.

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test src/lib/domain/fuel/reconciliation.test.ts`
Expected: FAIL because implementation is missing.

- [ ] **Step 3: Implement `reconcileFuel`**

Use signed values by event type, clamp floating noise only at presentation boundaries, and never infer tank-reconciled consumption unless both opening and closing quantities exist.

- [ ] **Step 4: Run test and verify it passes**

Run: `bun test src/lib/domain/fuel/reconciliation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/fuel/reconciliation.ts src/lib/domain/fuel/reconciliation.test.ts
git commit -m "feat: add deterministic fuel reconciliation"
```

---

### Task 6: Make fuel posting transactional and projection-safe

**Files:**
- Create: `src/lib/services/fuel-service.ts`
- Create: `src/lib/services/fuel-service.test.ts`
- Modify: `src/app/api/fuel-logs/route.ts`
- Modify: `src/lib/validations.ts`

**Interfaces:**
- Consumes: `recordOdometerReading()` from Task 4 and `reconcileFuel()` from Task 5.
- Produces:

```ts
export async function createFuelEvent(input: CreateFuelEventInput, actor: AuthContext): Promise<FuelLog>
export async function recomputeTripFuelProjection(tripId: string, tx: Prisma.TransactionClient): Promise<{ fuelUsed: number | null; fuelCost: number }>
```

- [ ] **Step 1: Extend Zod fuel validation tests**

Add tests asserting positive litres/cost for normal events, valid event type/source, optional GPS bounds, and required reason/reference for reversals.

- [ ] **Step 2: Write failing service tests**

Assert:
- trip not found -> `TRIP_NOT_FOUND`;
- truck different from `trip.truckId` -> `TRIP_TRUCK_MISMATCH`;
- two fills recompute trip `fuelUsed`/`fuelCost` as totals, not latest fill;
- odometer observation is recorded through Task 4 when supplied;
- transaction failure after fuel insert leaves neither fuel event nor updated projection;
- exact duplicate receipt/station/date/amount/truck submission is rejected with `DUPLICATE_FUEL_EVENT`.

- [ ] **Step 3: Implement fuel service**

Use `db.$transaction(async tx => ...)`. Create the event, optional odometer observation, aggregate all non-reversed eligible trip events, call `reconcileFuel`, and write compatibility `Trip.fuelUsed`/`Trip.fuelCost` projections in the same transaction.

- [ ] **Step 4: Replace POST route internals**

`src/app/api/fuel-logs/route.ts` must validate with `fuelLogCreateSchema`, authorize, call `createFuelEvent`, and map domain errors to 400/404/409 responses. Remove best-effort `.catch(() => {})` projection updates.

- [ ] **Step 5: Run tests**

Run: `bun test src/lib/services/fuel-service.test.ts src/lib/domain/fuel/reconciliation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/fuel-service.ts src/lib/services/fuel-service.test.ts src/app/api/fuel-logs/route.ts src/lib/validations.ts
git commit -m "fix: make fuel posting atomic and aggregate trip totals"
```

---

### Task 7: Make trip numbering and creation concurrency-safe and atomic

**Files:**
- Create: `src/lib/services/trip-number-service.ts`
- Create: `src/lib/services/trip-number-service.test.ts`
- Create: `src/lib/services/trip-service.ts`
- Create: `src/lib/services/trip-service.test.ts`
- Modify: `src/app/api/trips/route.ts`

**Interfaces:**
- Produces:

```ts
export async function reserveTripNumber(tx: Prisma.TransactionClient, at: Date): Promise<string>
export async function createTrip(input: ValidatedTripCreateInput, actor: AuthContext): Promise<TripCreateResult>
```

- [ ] **Step 1: Write failing trip-number tests**

Assert:
- year 2026 + next value 1 -> `TRP-2026-001`;
- 999 -> `TRP-2026-999`;
- 1000 -> `TRP-2026-1000` without truncation;
- two concurrent reservations produce distinct values.

- [ ] **Step 2: Implement sequence reservation**

Use the `TripSequence` row for the year inside the caller’s DB transaction. Do not use trip `count + 1`.

- [ ] **Step 3: Write failing trip-service rollback tests**

Assert:
- trip + items + destinations + destination links are one transaction;
- a forced nested-write failure leaves no trip row and does not consume a committed sequence value beyond DB transaction semantics;
- `markCompleted` cannot fabricate lifecycle timestamps unless the legacy shortcut is explicitly allowed by a dedicated policy flag; default new calls should create a scheduled trip.

- [ ] **Step 4: Implement `createTrip` transactional service**

Move trip creation, rate lookup snapshot, items, destinations, links, initial trip event and start odometer observation into one transaction. Keep invoice generation and notifications after commit, idempotent/non-blocking, because external side effects cannot participate in the DB transaction.

- [ ] **Step 5: Refactor POST `/api/trips`**

Route must validate, authorize, call `createTrip`, then invoke post-commit invoice/notification side effects with the returned committed trip ID.

- [ ] **Step 6: Run tests**

Run: `bun test src/lib/services/trip-number-service.test.ts src/lib/services/trip-service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/trip-number-service.ts src/lib/services/trip-number-service.test.ts src/lib/services/trip-service.ts src/lib/services/trip-service.test.ts src/app/api/trips/route.ts
git commit -m "feat: make trip creation transactional and concurrency safe"
```

---

### Task 8: Fix weighbridge/weight verification contract

**Files:**
- Create: `src/lib/domain/weight/variance.ts`
- Create: `src/lib/domain/weight/variance.test.ts`
- Modify: `src/app/api/weight-verifications/route.ts`
- Modify: `src/lib/validations.ts`
- Modify: `src/components/operations/WeightVerificationView.tsx`

**Interfaces:**
- Produces:

```ts
export function calculateWeightVariance(verifiedWeight: number, declaredWeight: number | null): {
  variance: number | null
  variancePercent: number | null
  status: 'verified' | 'variance_detected'
  varianceClass: 'within_tolerance' | 'over' | 'under'
}
```

- [ ] **Step 1: Write failing variance tests**

Assert:
- declared null -> verified / within_tolerance / null percentages;
- +5.0% and -5.0% remain `verified` / `within_tolerance`;
- +5.1% -> `variance_detected` / `over`;
- -5.1% -> `variance_detected` / `under`;
- zero/negative declared weight is validation error, not division-by-zero.

- [ ] **Step 2: Implement pure variance calculation**

Use the exact >5% and <-5% threshold from the approved design/current behavior.

- [ ] **Step 3: Refactor weight verification API**

Remove invalid `overweight`/`underweight` status writes and summary queries. Store canonical `status` plus `varianceClass`; summary counts filter on `varianceClass`.

- [ ] **Step 4: Update UI filters/badges**

Display `Over`, `Under`, or `Within tolerance` from `varianceClass`, while status remains `Verified`/`Variance detected`/etc.

- [ ] **Step 5: Run tests and typecheck**

Run:
- `bun test src/lib/domain/weight/variance.test.ts`
- `bun run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/weight src/app/api/weight-verifications/route.ts src/lib/validations.ts src/components/operations/WeightVerificationView.tsx
git commit -m "fix: align weighbridge variance with canonical schema"
```

---

### Task 9: Add authoritative trip reconciliation service and snapshot

**Files:**
- Create: `src/lib/services/trip-reconciliation-service.ts`
- Create: `src/lib/services/trip-reconciliation-service.test.ts`
- Create: `src/app/api/trips/[id]/reconciliation/route.ts`

**Interfaces:**
- Consumes: odometer ledger from Task 4; fuel reconciliation from Tasks 5–6.
- Produces:

```ts
export async function calculateTripReconciliation(tripId: string, tx?: Prisma.TransactionClient): Promise<TripReconciliationDraft>
export async function saveTripReconciliation(tripId: string, actor: AuthContext): Promise<TripReconciliation>
```

- [ ] **Step 1: Write failing reconciliation tests**

Fixture: trip start 100000, end 100800, two fuel fills totaling 140 L, opening tank 80 L, closing tank 60 L, fuel cost ₵2,100.

Assert:
- odometer distance = 800 km;
- consumed fuel = 160 L on `tank_reconciled` basis;
- km/L = 5;
- L/100 km = 20;
- fuel cost/km = 2.625;
- snapshot records exception count when GPS/odometer or missing evidence rules flag an issue;
- recalculation is deterministic from ledger data.

- [ ] **Step 2: Implement calculation service**

Read verified odometer readings, fuel events, trip revenue and approved trip expenses. Do not trust mutable `Trip.totalMileage/fuelUsed/fuelCost` as inputs.

- [ ] **Step 3: Implement snapshot save**

Upsert the `TripReconciliation` snapshot transactionally and refresh compatibility Trip projection fields from the calculated result.

- [ ] **Step 4: Add authenticated API route**

GET returns calculated current reconciliation without mutating; POST/PUT saves a snapshot for Admin/Manager only in this phase.

- [ ] **Step 5: Run tests**

Run: `bun test src/lib/services/trip-reconciliation-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/trip-reconciliation-service.ts src/lib/services/trip-reconciliation-service.test.ts src/app/api/trips/[id]/reconciliation/route.ts
git commit -m "feat: add authoritative trip reconciliation snapshots"
```

---

### Task 10: Cut fuel analytics over to authoritative reconciled data

**Files:**
- Modify: `src/app/api/fuel-consumption/route.ts`
- Modify: `src/lib/reports/report-data-new.ts`
- Test: `src/lib/domain/analytics/fuel-analytics.test.ts`
- Create: `src/lib/domain/analytics/fuel-analytics.ts`

**Interfaces:**
- Produces pure aggregation helpers for truck/zone summaries.
- Consumes saved `TripReconciliation` where available; explicitly labels legacy fallback rows when historical trips have not yet been reconciled.

- [ ] **Step 1: Write failing analytics tests**

Assert:
- zone filter scopes both trips and their fuel, never fleet-wide fuel against zone-only revenue;
- expected zone fuel cost is multiplied/aggregated per qualifying trip, not compared once against many trips;
- reconciled trip metrics take precedence over legacy `Trip` summaries;
- historical fallback is tagged `legacy_projection` in API data.

- [ ] **Step 2: Implement pure aggregation helper**

Create functions that receive normalized trip reconciliation rows and expected rates; keep DB access out of the pure module.

- [ ] **Step 3: Refactor `/api/fuel-consumption`**

Fetch matching completed trips/reconciliation rows first, then derive fuel totals from the same trip set. Remove odometer-from-consecutive-fuel-logs as the primary distance fallback.

- [ ] **Step 4: Align report data**

Use the same authoritative metrics/helper in `report-data-new.ts` rather than duplicating formulas.

- [ ] **Step 5: Run tests**

Run: `bun test src/lib/domain/analytics/fuel-analytics.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/analytics src/app/api/fuel-consumption/route.ts src/lib/reports/report-data-new.ts
git commit -m "fix: base fuel analytics on reconciled trip data"
```

---

### Task 11: Replace production `db push` with migration deployment and health gate

**Files:**
- Modify: `scripts/webhook-deploy.sh`
- Create: `scripts/deploy/preflight.sh`
- Create: `scripts/deploy/smoke-test.sh`
- Modify: `DEPLOYMENT.md`
- Test: `scripts/deploy/deploy-script.test.ts`

**Interfaces:**
- Produces deployment sequence: preflight -> backup/checkpoint hook -> `prisma migrate deploy` -> build -> restart -> smoke test.
- Deployment must abort before restart on migration/build failure and report unhealthy status when post-restart smoke checks fail.

- [ ] **Step 1: Write deployment script contract test**

Test source text to assert:
- `prisma db push` is absent from deployment script;
- `prisma migrate deploy` is present;
- no `sed` mutation of Prisma provider exists;
- preflight occurs before migration;
- smoke test occurs after restart.

- [ ] **Step 2: Run test and verify it fails**

Run: `bun test scripts/deploy/deploy-script.test.ts`
Expected: FAIL against current script.

- [ ] **Step 3: Implement preflight**

`preflight.sh` verifies required env vars, MariaDB connectivity via Prisma, migration directory presence, disk headroom, and executable dependencies without printing secrets.

- [ ] **Step 4: Refactor webhook deployment**

Remove provider-patching and `db push`. Run `bun run check`, `bunx prisma migrate deploy`, build, restart, then smoke test. Preserve lock handling and local-only `.env`/webhook config behavior while never echoing their values.

- [ ] **Step 5: Implement smoke test**

Check application health endpoint and one authenticated-independent health signal. Exit non-zero on failure.

- [ ] **Step 6: Update deployment documentation**

Document development/staging/production database separation, secret rotation requirement, migration procedure, backup requirement, and rollback steps.

- [ ] **Step 7: Run deployment contract test**

Run: `bun test scripts/deploy/deploy-script.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/webhook-deploy.sh scripts/deploy DEPLOYMENT.md
git commit -m "deploy: use reviewed migrations and health gates"
```

---

### Task 12: Foundation integration tests and release gate

**Files:**
- Create: `tests/integration/core-integrity.test.ts`
- Create: `tests/fixtures/core-integrity.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**
- Produces a single regression suite proving the foundation works end-to-end against an isolated test MariaDB schema.

- [ ] **Step 1: Add isolated integration-test database configuration**

Add `test:integration` script that requires `TEST_DATABASE_URL`; it must refuse to run if the database name matches configured production database naming or if `NODE_ENV=production`.

- [ ] **Step 2: Write end-to-end core integrity test**

Test this sequence:
1. create truck/driver/zone fixture;
2. create trip through service and assert unique trip number;
3. record start odometer;
4. post two fuel events;
5. add valid weighbridge record with >5% variance and assert canonical status/class;
6. record trip-end odometer;
7. save reconciliation;
8. assert 800 km, summed fuel cost/litres, deterministic efficiency metrics, and updated compatibility projections;
9. submit an invalid lower odometer and assert no persisted mutation;
10. submit wrong-truck fuel event and assert no persisted mutation.

- [ ] **Step 3: Add transaction rollback test**

Force a nested trip-item/destination failure and assert trip/items/sequence state rolls back as designed.

- [ ] **Step 4: Add CI MariaDB service**

Update workflow to start MariaDB, set `TEST_DATABASE_URL`, run `prisma migrate deploy` against test DB, then `bun run test:integration` after unit tests.

- [ ] **Step 5: Run the complete release gate locally**

Run:
- `bun run check`
- `TEST_DATABASE_URL=<isolated-test-db> bun run test:integration`
- `bun run build`

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests package.json .github/workflows/ci.yml
git commit -m "test: add core integrity integration release gate"
```

---

## Plan self-review result

- **Spec coverage for this sub-project:** security/environment isolation, transaction safety, trip number concurrency, odometer ledger, multi-fill fuel reconciliation, canonical weight variance, reconciliation snapshots, trustworthy fuel analytics, migration policy, tests and CI are covered.
- **Intentionally deferred:** full driver mobile lifecycle/POD, offline sync, finance allocation/settlement redesign, advanced dashboards and all AI feature implementation. These require separate plans and consume the authoritative data created here.
- **Type consistency:** later tasks consume the exact odometer/fuel/trip service interfaces introduced earlier; no alternate duplicate calculation API is planned.
- **Review Focus coverage:** concurrency is Task 7/12; odometer rollback/wrong truck is Task 4/6/12; multi-fill/duplicates is Task 5/6; transaction rollback is Task 6/7/12; ±5% boundary is Task 8.
- **Proportion:** this plan specifies interfaces/tests and execution boundaries rather than implementation bodies.

## Required production-side actions before deployment

These are operational security actions, not code substitutions:

1. Rotate the exposed production database password/user credentials.
2. Rotate the deployment webhook secret.
3. Rotate any API/token values that were ever committed or copied into tracked docs.
4. Restrict MariaDB network access to approved hosts/private connectivity rather than broad internet exposure.
5. Provision separate staging/test credentials and database.
6. Verify backups before the first `prisma migrate deploy` rollout.

Do not consider deletion/redaction from git sufficient; previously published secrets remain compromised after removal.

## Follow-on plan order

After this foundation is merged and verified:

1. Driver Trip Execution + POD + offline queue.
2. Trip Finance, settlements and owner profitability.
3. Advanced fleet analytics and operational command center.
4. AI Dispatch Copilot + route/ETA optimization.
5. Fuel Theft/Anomaly Intelligence.
6. Predictive Maintenance + tyre/service intelligence.
7. Driver safety/efficiency AI scoring.
8. Document/waybill/receipt intelligence.
9. Management Copilot + profitability/cash forecasting.
10. Multi-company/SaaS tenancy if product strategy requires it.
