# Phase 7 Route Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prototype Route Optimizer backend with a deterministic, evidence-labelled advisory service that uses authoritative route, eligibility, telematics and fuel-history evidence without gaining dispatch authority.

**Architecture:** Introduce a pure `route-intelligence` domain layer, a Prisma-backed evidence loader, and a thin API adapter. Reuse Phase 1 dispatch eligibility and Phase 6 assignment constraints rather than creating a second dispatch rule engine. Preserve the current Route Optimizer UI while adding provenance, freshness and confidence surfaces.

**Tech Stack:** Next.js 16, TypeScript, Prisma/MariaDB, Vitest, existing Phase 1–6 domain services.

**Spec:** `docs/superpowers/specs/2026-10-10-phase-7-route-intelligence-design.md`

## Global Constraints

- Advisory only: no trip, assignment, clearance or financial mutation.
- Fleet recommendations may contain only currently eligible candidates.
- Driver users must never receive fleet-wide candidate recommendations.
- Live-state freshness uses server `receivedAt`, not device time.
- Static Ghana route data remains a labelled fallback, never a claim of live traffic/road truth.
- Missing evidence reduces data quality; it never creates fabricated precision.
- Candidate data loading must be batched and avoid per-truck N+1 queries.
- No driver phone/licence/Ghana Card data in route-advisory responses.
- Confidence is always in 0..1 and must never exceed data quality.

## Review Focus

- Malformed/hostile numeric query inputs must return 400 before calculations.
- Busy, maintenance-blocked or otherwise ineligible assets must never enter recommendation ranking.
- Stale/missing telematics must remain distinguishable from fresh live location.
- Sparse fuel history must fall back deterministically without overstating quality.
- Authorization must separate route viewing from fleet-wide recommendation visibility.

---

### Task 1: Pure Route Advisory and Fuel-Evidence Domain

**Files:**
- Create: `src/lib/domain/route-intelligence/advisory.ts`
- Create: `src/lib/domain/route-intelligence/__tests__/advisory.test.ts`
- Modify: `src/lib/ghana-routes.ts`

**Interfaces:**
- Consumes: existing `getRoute`, `calculateMultiStopRoute`, and Ghana route fallback data.
- Produces: `validateRouteAdvisoryInput`, `selectFuelEfficiencyEvidence`, `buildRouteAdvisory`, `RouteAdvisoryInput`, `RouteAdvisoryResult`.

- [ ] **Step 1: Write failing domain tests**

Cover:
- finite/bounded `weight` and `fuelPrice` validation;
- multi-stop missing-leg failure;
- truck-history > fleet-history > default fuel evidence selection;
- bounded cargo adjustment;
- confidence <= data quality;
- static route source is `static_fallback` and lowers quality.

- [ ] **Step 2: Run focused test and verify RED**

Run: `bun test src/lib/domain/route-intelligence/__tests__/advisory.test.ts`
Expected: FAIL because the new module/functions do not exist.

- [ ] **Step 3: Implement minimal pure domain logic**

Implement deterministic route/fuel calculations with explicit provenance. Do not add Prisma access.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test src/lib/domain/route-intelligence/__tests__/advisory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: add deterministic route advisory domain`

### Task 2: Batched Operational Candidate Evidence Loader

**Files:**
- Create: `src/lib/domain/route-intelligence/prisma-route-advisory-repository.ts`
- Create: `src/lib/domain/route-intelligence/__tests__/repository-contract.test.ts`
- Reuse: `src/lib/domain/dispatch/eligibility.ts`
- Reuse: `src/lib/domain/ai-ops/assignment.ts`

**Interfaces:**
- Consumes: `evaluateAssignmentEligibility`, active-trip/coupling constraints, `VehicleLiveState`, completed trip fuel/distance history.
- Produces: `PrismaRouteAdvisoryRepository.loadFleetEvidence(context)` returning normalized candidate snapshots plus truck/fleet fuel evidence.

- [ ] **Step 1: Write failing repository contract tests**

Assert source contract contains batched `findMany` queries for live state, active trips and history; does not perform `findFirst` inside a tractor loop; does not select driver phone/licence/Ghana Card fields; and reuses `evaluateAssignmentEligibility`.

- [ ] **Step 2: Run focused test and verify RED**

Run: `bun test src/lib/domain/route-intelligence/__tests__/repository-contract.test.ts`
Expected: FAIL because repository does not exist.

- [ ] **Step 3: Implement batched loader**

Load active tractors/drivers/trailers and related statutory evidence, active assignments/couplings, tractor `VehicleLiveState`, and recent completed-trip distance/fuel history in bounded queries. Normalize freshness using `receivedAt` and produce blockers/warnings/quality evidence without PII leakage.

- [ ] **Step 4: Run repository + existing dispatch/assignment suites**

Run: `bun test src/lib/domain/route-intelligence/__tests__/repository-contract.test.ts src/lib/domain/dispatch/__tests__/eligibility.test.ts src/lib/domain/ai-ops/__tests__/assignment.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: load authoritative route recommendation evidence`

### Task 3: Candidate Ranking with Freshness and Hard Eligibility Gates

**Files:**
- Modify: `src/lib/domain/route-intelligence/advisory.ts`
- Modify: `src/lib/domain/route-intelligence/__tests__/advisory.test.ts`

**Interfaces:**
- Consumes: normalized repository candidate snapshots from Task 2.
- Produces: `rankRouteCandidates` and recommendation objects containing `tractorId`, optional driver/trailer identity IDs, deadhead estimate, location provenance/freshness, confidence, data quality, reasons and warnings.

- [ ] **Step 1: Add failing ranking tests**

Prove:
- blocked/busy/maintenance-held candidates are excluded;
- fresh live telematics beats stale/unknown location when other evidence is equivalent;
- stale state is retained as stale evidence but penalized;
- deterministic tie-breaking is stable;
- no result confidence exceeds candidate data quality.

- [ ] **Step 2: Run focused test and verify RED**

Run: `bun test src/lib/domain/route-intelligence/__tests__/advisory.test.ts`
Expected: FAIL on missing ranking behavior.

- [ ] **Step 3: Implement ranking**

Use hard eligibility filtering followed by deterministic deadhead/freshness/data-quality ranking. Do not mutate any persisted record.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `bun test src/lib/domain/route-intelligence/__tests__/advisory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: rank eligible route candidates with live evidence`

### Task 4: Harden `/api/routes/optimize`

**Files:**
- Modify: `src/app/api/routes/optimize/route.ts`
- Create: `src/app/api/routes/optimize/route.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 advisory domain/repository.
- Produces: backwards-compatible route response plus `advisoryVersion`, `generatedAt`, provenance, quality/confidence and permission-scoped recommendations.

- [ ] **Step 1: Write failing API tests**

Cover:
- missing/invalid city -> 400;
- `NaN`, `Infinity`, negative and out-of-bound numeric inputs -> 400;
- more than five stops -> 400;
- trip-view user gets route advisory but no fleet candidate list without `trips.create`;
- authorized dispatcher gets sanitized candidate recommendations;
- endpoint does not invoke trip/assignment mutation methods;
- missing route leg -> explicit 404/422-style route-data response without fabricated route.

- [ ] **Step 2: Run focused API test and verify RED**

Run: `bun test src/app/api/routes/optimize/route.test.ts`
Expected: FAIL against the prototype endpoint.

- [ ] **Step 3: Replace prototype endpoint orchestration**

Use `requirePermission`/permission-aware auth, strict input parsing, advisory domain and repository. Remove per-truck `findFirst` loops and last-fill-as-current-fuel assumptions. Keep response fields the UI already depends on where practical.

- [ ] **Step 4: Run API/domain tests and verify GREEN**

Run: `bun test src/app/api/routes/optimize/route.test.ts src/lib/domain/route-intelligence/__tests__/advisory.test.ts src/lib/domain/route-intelligence/__tests__/repository-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: harden route optimizer advisory api`

### Task 5: Expose Evidence Quality in Route Optimizer UI

**Files:**
- Modify: `src/components/operations/RouteOptimizerView.tsx`
- Create: `src/components/operations/__tests__/route-optimizer-contract.test.tsx`

**Interfaces:**
- Consumes: Task 4 API response.
- Produces: evidence-labelled route/fuel/candidate UI without changing dispatch authority.

- [ ] **Step 1: Write failing UI contract tests**

Assert the view renders/handles source, quality grade, fallback notices and telematics freshness; does not call a dispatch mutation endpoint; and does not label a fallback numeric fuel price as current/recommended market price.

- [ ] **Step 2: Run focused test and verify RED**

Run: `bun test src/components/operations/__tests__/route-optimizer-contract.test.tsx`
Expected: FAIL on missing provenance UI.

- [ ] **Step 3: Update the view**

Preserve route planner/cost calculator and mobile behavior. Add concise evidence/freshness badges and limited-confidence explanations. Hide candidate section when API omits recommendations for permission reasons.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test src/components/operations/__tests__/route-optimizer-contract.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: show route advisory provenance and confidence`

### Task 6: Phase 7 Release Gate

**Files:**
- Modify only if verification finds a real defect.
- Create/update execution ledger under ignored `.superpowers` workspace as required by executor skill.

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: clean feature branch ready for PR and CI.

- [ ] **Step 1: Run focused Phase 7 suite**

Run: `bun test src/lib/domain/route-intelligence src/app/api/routes/optimize/route.test.ts src/components/operations/__tests__/route-optimizer-contract.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run repository secret scan**

Run: `bun run security:scan`
Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run: `bun run test`
Expected: PASS with zero failing tests.

- [ ] **Step 4: Run full lint**

Run: `bun run lint`
Expected: PASS with zero errors.

- [ ] **Step 5: Run production build**

Run: `NODE_ENV=production bun run build`
Expected: PASS.

- [ ] **Step 6: Verify diff cleanliness and advisory boundary**

Run: `git diff --check` and inspect changed files for trip/assignment mutation calls.
Expected: clean diff; no new autonomous mutation path.

- [ ] **Step 7: Push PR, require exact-head CI, review and merge only when green**

PR target: `main`.

## Self-review

- Spec coverage: input validation, route provenance, telematics freshness, eligibility gating, fuel evidence hierarchy, RBAC, PII, N+1 avoidance, UI and non-mutation all map to tasks above.
- Shared interfaces: Task 2 normalized evidence feeds Task 3; Task 1/3 feed Task 4; Task 4 response feeds Task 5.
- Review-focus failures each have an explicit test in the task that owns the behavior.
- Phase 3 geofence/route-deviation processing and Phase 6 assignment recommendation remain reused/adjacent rather than duplicated.
- No external live-routing provider is introduced, so the plan does not overclaim traffic/road freshness.
