# iFleetPro Fuel Theft & Anomaly Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an auditable observer-mode fuel anomaly intelligence subsystem that detects deterministic and robust statistical irregularities from server-owned fleet evidence without allowing AI to become an enforcement authority.

**Architecture:** Server-owned evidence is normalized into an immutable assessment snapshot, then evaluated by pure deterministic rules and robust median/MAD baselines. A versioned assessment service persists findings and human review history; an optional explanation-only AI layer may summarize existing findings but cannot create, remove, score, or reclassify them. Observer scans are idempotent and never mutate fuel, odometer, trip, reconciliation, money, driver, or truck state.

**Tech Stack:** Next.js 16.1, React 19, TypeScript, Bun, Prisma 7.8 multi-file schema, MariaDB 11.8, Zod 4, existing `@/lib/auth-server`, existing Core Integrity fuel/odometer/reconciliation services, Bun test, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-07-ifleetpro-fuel-anomaly-intelligence-design.md`

## Global Constraints

- First release is observer/review only; no automatic punishment, suspension, money movement, source-record mutation, or fuel-purchase blocking.
- Evidence is sourced by the server from authoritative records; caller-supplied fuel logs, baselines, findings, scores, driver histories, and vehicle evidence are rejected.
- LLM output is explanation-only and cannot alter finding membership, IDs, severity, risk, confidence, data quality, ordering, or review state.
- Missing GPS, tank capacity, fuel levels, distance, price, route or baseline evidence remains unknown and lowers confidence/data quality; values must never be guessed.
- Statistical baseline policy is versioned: preferred sample size >= 12, advisory 6-11, below 6 suppresses statistical findings.
- Baseline priority is truck+route/zone -> truck -> route/zone -> comparable fleet; driver history is secondary context only.
- Risk bands are 0-19 informational, 20-39 low, 40-59 medium, 60-79 high, 80-100 critical review priority only when at least one strong-evidence rule supports critical; otherwise cap at high.
- Findings created from an assessment snapshot are immutable; review history is append-only.
- Re-evaluation never silently overwrites historical assessments; it creates a new assessment when evidence hash or rules/baseline version changes.
- No production migration or deployment in this plan; all schema proof uses disposable MariaDB.
- Branch remains based on `implementation/ifleetpro-core-integrity-foundation` until foundation rollout prerequisites are resolved.

## Review Focus

- **Sparse or missing evidence:** rules requiring unavailable tank/GPS/distance/baseline evidence must suppress themselves and reduce data quality rather than infer values. Pinned in Tasks 2, 3, 5 and 11.
- **Repeated/near-duplicate events:** exact duplicates remain blocked by the existing fuel service while fuzzy duplicates become review findings without double-counting risk. Pinned in Tasks 2, 4 and 11.
- **Idempotent observer scans:** the same subject + evidence hash + versions must not create duplicate assessments; changed evidence must create a new assessment. Pinned in Tasks 6, 9 and 11.
- **Authority leakage from AI or review APIs:** explanation and review endpoints must not mutate source fuel/odometer/trip/reconciliation state or authoritative scores. Pinned in Tasks 7, 8 and 11.
- **Statistical edge cases:** zero MAD, discrete distributions, outlier contamination and insufficient samples must produce deterministic bounded behavior. Pinned in Task 3.

---

## Planned File Structure

- `prisma/fuel-intelligence.prisma` — anomaly assessment/finding/review models and enums.
- `prisma/migrations/<timestamp>_fuel_anomaly_intelligence/migration.sql` — additive MariaDB migration.
- `src/lib/domain/fuel-intelligence/types.ts` — stable domain contracts and finding codes.
- `src/lib/domain/fuel-intelligence/policy.ts` — versioned thresholds, risk weights and baseline policy.
- `src/lib/domain/fuel-intelligence/rules.ts` — pure deterministic rule evaluation.
- `src/lib/domain/fuel-intelligence/statistics.ts` — median/MAD/IQR helpers.
- `src/lib/domain/fuel-intelligence/baselines.ts` — cohort selection and statistical findings.
- `src/lib/domain/fuel-intelligence/risk.ts` — correlation-aware risk/confidence/data-quality aggregation.
- `src/lib/services/fuel-anomaly-evidence-service.ts` — authoritative allow-listed evidence loader.
- `src/lib/services/fuel-anomaly-assessment-service.ts` — snapshot hashing, persistence, idempotency, review transitions.
- `src/lib/ai/fuel-anomaly/model-payload.ts` — sanitized explanation payload and response merge validation.
- `src/lib/ai/fuel-anomaly/explainer-client.ts` — fail-closed AI client with deterministic fallback.
- `src/lib/config/ai-service.ts` — shared explicit AI service URL/key configuration if not already present after branch integration.
- `mini-services/ai-service/fuel-anomaly-explainer.ts` — explanation-only mini-service contract.
- `src/app/api/ai/fuel-anomaly/route.ts` — authenticated assessment POST/retrieval boundary.
- `src/app/api/ai/fuel-anomaly/[id]/review/route.ts` — human review endpoint.
- `src/app/api/ai/fuel-anomaly/shadow-scan/route.ts` — internal/admin observer scan trigger.
- `src/lib/services/fuel-anomaly-shadow-scan-service.ts` — idempotent scheduled/server-owned scanner.
- `src/app/(dashboard)/fuel-intelligence/page.tsx` — manager/admin dashboard.
- `src/components/fuel-intelligence/FuelIntelligenceDashboard.tsx` — dashboard presentation/filtering.
- `src/components/fuel-intelligence/FuelAnomalyAssessmentDetail.tsx` — evidence + review detail panel.
- `tests/integration/fuel-anomaly-intelligence.test.ts` — disposable MariaDB end-to-end acceptance fixture.

---

### Task 1: Persistence and Provenance Ledger

**Files:**
- Create: `prisma/fuel-intelligence.prisma`
- Create: `prisma/migrations/<timestamp>_fuel_anomaly_intelligence/migration.sql`
- Create: `src/lib/domain/fuel-intelligence/schema-contract.test.ts`
- Regenerate: `src/generated/**`

**Interfaces:**
- Produces Prisma models `FuelAnomalyAssessment`, `FuelAnomalyFinding`, `FuelAnomalyReviewEvent` and enums for subject type, severity, assessment status, and outcome code.
- Later tasks depend on the generated Prisma client names exactly as specified above.

- [ ] **Step 1: Write the failing schema contract test** asserting the three models exist; assessment stores subject refs, versions, input hash/snapshot, risk/confidence/data quality, explanation audit and current review projection; findings store immutable code/evidence/contribution; review events store append-only transitions.
- [ ] **Step 2: Run `bun test src/lib/domain/fuel-intelligence/schema-contract.test.ts`** and verify RED because the schema file/models do not exist.
- [ ] **Step 3: Add the multi-file Prisma schema and additive migration** with indexes for assessment status/severity/truck/trip/fuelLog/requestedAt, finding assessment/code/severity, and review-event assessment/createdAt.
- [ ] **Step 4: Run `bunx prisma format && bunx prisma validate && bunx prisma generate`** and rerun the schema test; expect GREEN.
- [ ] **Step 5: Apply the migration to a disposable MariaDB database** using `prisma migrate deploy`; expect all foundation migrations plus the new migration to apply cleanly.
- [ ] **Step 6: Commit** `feat: add fuel anomaly provenance ledger`.

### Task 2: Domain Types, Policy and Deterministic Rules

**Files:**
- Create: `src/lib/domain/fuel-intelligence/types.ts`
- Create: `src/lib/domain/fuel-intelligence/policy.ts`
- Create: `src/lib/domain/fuel-intelligence/rules.ts`
- Create: `src/lib/domain/fuel-intelligence/rules.test.ts`

**Interfaces:**
- Produces `FuelAssessmentEvidence`, `FuelAnomalyFindingDraft`, `EvidenceAvailability`, `FuelAnomalyRuleContext`.
- Produces `FUEL_ANOMALY_RULESET_VERSION` and versioned tolerances/weights.
- Produces `evaluateFuelIntegrityRules(evidence: FuelAssessmentEvidence, policy?: FuelAnomalyPolicy): FuelAnomalyFindingDraft[]`.

- [ ] **Step 1: Write failing tests** for exact tank-capacity boundary/tolerance, `FUEL_TANK_CAPACITY_EXCEEDED`, contradictory fill-level math, negative tank balance, unexplained tank loss, `FUEL_CONSUMPTION_EXTREME_PHYSICAL` only when explicit truck-class bounds exist, fuel added with zero/near-zero distance, missing usable fuel advisory, reconciliation exception cluster, receipt reuse, near duplicate, reversal cluster, `FUEL_POST_VERIFICATION_REVERSAL_CLUSTER`, `FUEL_LOCATION_OUTSIDE_EXPECTED_AREA` only when reliable route/geofence evidence exists, `FUEL_LOCATION_EVIDENCE_MISSING` only when capture policy expected GPS, and missing-evidence suppression.
- [ ] **Step 2: Run the rule test file** and verify RED with missing exports.
- [ ] **Step 3: Implement stable finding codes and versioned policy constants** from the spec; do not include statistical rules in this task.
- [ ] **Step 4: Implement `evaluateFuelIntegrityRules` as pure deterministic evaluation**; every finding includes evidence, deterministic reason, recommended action, confidence/data-quality contribution and stable related IDs.
- [ ] **Step 5: Rerun the rule tests**; expect GREEN and deterministic identical output for identical input.
- [ ] **Step 6: Commit** `feat: add deterministic fuel integrity rules`.

### Task 3: Robust Statistics and Baseline Engine

**Files:**
- Create: `src/lib/domain/fuel-intelligence/statistics.ts`
- Create: `src/lib/domain/fuel-intelligence/baselines.ts`
- Create: `src/lib/domain/fuel-intelligence/baselines.test.ts`

**Interfaces:**
- Produces `median(values: number[]): number | null`, `medianAbsoluteDeviation(values: number[], medianValue?: number): number | null`, `interquartileRange(values: number[]): { q1: number; q3: number; iqr: number } | null`.
- Produces `selectFuelBaseline(input: BaselineSelectionInput): FuelBaselineSelection | null`.
- Produces `evaluateFuelBaselineFindings(input: FuelBaselineEvaluationInput): FuelAnomalyFindingDraft[]`.

- [ ] **Step 1: Write failing tests** for median/MAD, MAD-zero IQR fallback, priority truck+route -> truck -> route -> fleet, >=12 preferred confidence, 6-11 advisory confidence, <6 suppression, one efficiency outlier, sustained efficiency degradation, price/volume/frequency/cost outliers, and deterministic behavior with contaminated samples.
- [ ] **Step 2: Run `bun test src/lib/domain/fuel-intelligence/baselines.test.ts`** and verify RED.
- [ ] **Step 3: Implement robust statistics helpers** with finite-number filtering and deterministic percentile interpolation.
- [ ] **Step 4: Implement baseline selection and statistical findings** using only cohorts provided by authoritative evidence; no hidden fallback values.
- [ ] **Step 5: Rerun the baseline tests**; expect GREEN including zero-MAD and sparse-sample cases.
- [ ] **Step 6: Commit** `feat: add robust fuel anomaly baselines`.

### Task 4: Risk, Confidence and Correlation-Aware Aggregation

**Files:**
- Create: `src/lib/domain/fuel-intelligence/risk.ts`
- Create: `src/lib/domain/fuel-intelligence/risk.test.ts`

**Interfaces:**
- Produces `aggregateFuelAnomalyAssessment(findings: FuelAnomalyFindingDraft[], evidence: FuelAssessmentEvidence, policy?: FuelAnomalyPolicy): FuelAssessmentSummary`.
- `FuelAssessmentSummary` returns `overallRiskScore`, `overallSeverity`, `confidence`, `dataQuality` and contribution provenance.

- [ ] **Step 1: Write failing tests** for 0-19/20-39/40-59/60-79/80-100 bands, critical strong-evidence requirement, cap-at-high behavior, duplicate/correlated finding caps, low-confidence statistical findings, and missing evidence lowering data quality without increasing risk.
- [ ] **Step 2: Run the risk tests** and verify RED.
- [ ] **Step 3: Implement bounded risk aggregation and evidence-family correlation caps** using versioned weights from `policy.ts`.
- [ ] **Step 4: Implement separate confidence/data-quality aggregation** with authoritative verified evidence weighted highest and unavailable evidence lowest.
- [ ] **Step 5: Rerun the risk tests**; expect GREEN.
- [ ] **Step 6: Commit** `feat: aggregate fuel anomaly risk and confidence`.

### Task 5: Authoritative Fuel Evidence Service

**Files:**
- Create: `src/lib/services/fuel-anomaly-evidence-service.ts`
- Create: `src/lib/services/fuel-anomaly-evidence-service.test.ts`

**Interfaces:**
- Produces `loadFuelAnomalyEvidence(subject: FuelAnomalySubject, deps?: FuelAnomalyEvidenceDependencies): Promise<FuelAssessmentEvidence>`.
- Accepted subjects are `{ fuelLogId: string }`, `{ tripId: string }`, or `{ truckId: string; startDate: Date; endDate: Date }`.
- Exposes explicit Prisma select constants for allow-listed fields so tests can prove sensitive data is excluded.

- [ ] **Step 1: Write failing tests** proving server-owned source queries, explicit allow-lists, subject resolution, verified/pending evidence separation, truck tank capacity, odometer/reconciliation data, route/zone and driver IDs, reversals, GPS availability, comparable cohorts and `known|partial|unavailable` evidence-family status.
- [ ] **Step 2: Add tests for Review Focus sparse evidence** proving missing tank/GPS/route does not produce fabricated values and sensitive driver fields such as phone/licence/address never enter the normalized snapshot.
- [ ] **Step 3: Run the evidence-service tests** and verify RED.
- [ ] **Step 4: Implement the loader with injectable dependencies for unit tests and Prisma defaults for production**; keep each query explicitly selected and bounded by subject/window.
- [ ] **Step 5: Rerun the tests**; expect GREEN.
- [ ] **Step 6: Commit** `feat: load authoritative fuel anomaly evidence`.

### Task 6: Assessment Persistence, Idempotency and Review Lifecycle

**Files:**
- Create: `src/lib/services/fuel-anomaly-assessment-service.ts`
- Create: `src/lib/services/fuel-anomaly-assessment-service.test.ts`

**Interfaces:**
- Produces `assessFuelAnomaly(subject: FuelAnomalySubject, actor: FuelAnomalyActor, deps?: FuelAnomalyAssessmentDependencies): Promise<FuelAnomalyAssessmentResult>`.
- Produces `recordFuelAnomalyReview(assessmentId: string, input: FuelAnomalyReviewInput, actor: FuelAnomalyActor, deps?: ...): Promise<FuelAnomalyReviewResult>`.
- Produces `getFuelAnomalyAssessment(id: string, deps?: ...): Promise<FuelAnomalyAssessmentDetail | null>`.
- Uses canonical JSON + SHA-256 for `inputHash`.

- [ ] **Step 1: Write failing tests** proving evidence -> rules -> baselines -> aggregate -> immutable assessment/finding persistence; identical subject+hash+versions returns the existing assessment; changed evidence/version creates a new assessment.
- [ ] **Step 2: Write failing review-transition tests** for `open -> acknowledged -> investigating -> resolved|false_positive`, invalid transition rejection, required actor/time/history, reopening via append-only event, and valid outcome-code handling.
- [ ] **Step 3: Add authority tests** proving assessment/review services expose no source-record mutation dependency and never call fuel/odometer/trip/reconciliation updates.
- [ ] **Step 4: Add provenance/versioning tests** proving ruleset/baseline version + evidence hash are frozen, historical assessments are not recomputed in place, and logs use assessment/finding IDs rather than dumping snapshots.
- [ ] **Step 5: Run the service tests** and verify RED.
- [ ] **Step 6: Implement assessment orchestration/persistence and transactionally append review events + update current assessment projection**.
- [ ] **Step 7: Rerun the tests**; expect GREEN including idempotency, audit-safe logging and re-evaluation semantics.
- [ ] **Step 8: Commit** `feat: persist fuel anomaly assessments and reviews`.

### Task 7: Explanation-Only AI Boundary

**Files:**
- Create/modify: `src/lib/config/ai-service.ts`
- Create: `src/lib/ai/fuel-anomaly/model-payload.ts`
- Create: `src/lib/ai/fuel-anomaly/model-payload.test.ts`
- Create: `src/lib/ai/fuel-anomaly/explainer-client.ts`
- Create: `src/lib/ai/fuel-anomaly/explainer-client.test.ts`
- Create: `mini-services/ai-service/fuel-anomaly-explainer.ts`
- Create: `mini-services/ai-service/fuel-anomaly-explainer.test.ts`
- Modify: `mini-services/ai-service/index.ts`
- Modify supported mini-service start/bootstrap files only as required to remove fallback credentials.

**Interfaces:**
- Produces `buildFuelAnomalyExplanationPayload(assessment: FuelAnomalyAssessmentResult): FuelAnomalyExplanationPayload`.
- Produces `mergeFuelAnomalyExplanation(findings, rawModelOutput): FuelAnomalyExplanationResult`.
- Produces `explainFuelAnomalyAssessment(input, deps?): Promise<FuelAnomalyExplanationResult & { provider: string | null; model: string | null }>`.

- [ ] **Step 1: Write failing security/config tests** requiring explicit `AI_SERVICE_URL` and `INTERNAL_API_KEY` with no hardcoded fallback in the route or mini-service launch path.
- [ ] **Step 2: Write failing payload tests** proving only assessment/finding allow-listed fields are sent; no sensitive identifiers or raw evidence blobs beyond bounded summaries.
- [ ] **Step 3: Write failing response tests** rejecting invented/removed findings, changed severity/risk/confidence/data quality/order, unknown IDs, accusation-as-fact output, and malformed provider output; timeout/error falls back deterministically.
- [ ] **Step 4: Implement fail-closed config, sanitized payload builder, validator/merge layer, client timeout and deterministic fallback**.
- [ ] **Step 5: Implement mini-service explanation-only parser/handler** returning provider/model provenance but no authority-bearing fields.
- [ ] **Step 6: Run focused AI/config tests**; expect GREEN.
- [ ] **Step 7: Commit** `feat: enforce explanation-only fuel anomaly AI`.

### Task 8: Thin Authenticated API and Review Endpoints

**Files:**
- Replace: `src/app/api/ai/fuel-anomaly/route.ts`
- Create: `src/app/api/ai/fuel-anomaly/request-schema.ts`
- Create: `src/app/api/ai/fuel-anomaly/route-contract.test.ts`
- Create: `src/app/api/ai/fuel-anomaly/[id]/review/route.ts`

**Interfaces:**
- Recommendation/assessment POST accepts exactly one subject scope: `fuelLogId`, `tripId`, or `truckId+startDate+endDate`.
- Review POST accepts `toStatus`, optional `outcomeCode`, optional `notes`; actor identity always comes from auth context.

- [ ] **Step 1: Write failing Zod/request tests** accepting valid identifier scopes and rejecting caller-supplied `fuelLogs`, `vehicleInfo`, `baselines`, `findings`, `scores`, `driverHistory`, actor IDs and ambiguous/missing subjects.
- [ ] **Step 2: Write route-contract tests** proving manager/admin authority, thin delegation to the assessment service, explanation provenance persistence after optional AI, and review-only mutation of anomaly audit records.
- [ ] **Step 3: Run focused route tests** and verify RED.
- [ ] **Step 4: Implement schemas and thin routes**; route must not query raw fuel evidence itself and must not call source fuel/trip mutation APIs.
- [ ] **Step 5: Rerun route tests**; expect GREEN.
- [ ] **Step 6: Commit** `feat: expose safe fuel anomaly review APIs`.

### Task 9: Idempotent Observer/Shadow Scan

**Files:**
- Create: `src/lib/services/fuel-anomaly-shadow-scan-service.ts`
- Create: `src/lib/services/fuel-anomaly-shadow-scan-service.test.ts`
- Create: `src/app/api/ai/fuel-anomaly/shadow-scan/route.ts`

**Interfaces:**
- Produces `scanFuelAnomalySubjects(input: FuelAnomalyShadowScanInput, actor: FuelAnomalyActor, deps?: ...): Promise<FuelAnomalyShadowScanResult>`.
- Scan input supports a bounded `startDate`, `endDate`, optional `truckId`, and `limit`; production defaults must be bounded.

- [ ] **Step 1: Write failing tests** proving only eligible verified/reconciled subjects are scanned, identical evidence is idempotent, changed evidence creates a new assessment, per-run limits are honored, and one subject failure does not duplicate or corrupt other subjects.
- [ ] **Step 2: Write endpoint contract tests** requiring admin/internal authorization and rejecting unbounded or client-owned evidence payloads.
- [ ] **Step 3: Run the shadow-scan tests** and verify RED.
- [ ] **Step 4: Implement bounded subject discovery and delegation to `assessFuelAnomaly`**; no source-record writes or alerts in Phase A/B.
- [ ] **Step 5: Rerun tests**; expect GREEN.
- [ ] **Step 6: Commit** `feat: add observer-mode fuel anomaly scanning`.

### Task 10: Fuel Intelligence Query and Observability Service

**Files:**
- Create: `src/lib/services/fuel-anomaly-query-service.ts`
- Create: `src/lib/services/fuel-anomaly-query-service.test.ts`
- Create: `src/app/api/ai/fuel-anomaly/[id]/route.ts`
- Modify: `src/app/api/ai/fuel-anomaly/route.ts` to add RBAC-protected GET listing/summary behavior without weakening POST validation.

**Interfaces:**
- Produces `listFuelAnomalyAssessments(query: FuelAnomalyListQuery, deps?: ...): Promise<FuelAnomalyListResult>`.
- Produces `getFuelAnomalyDashboardSummary(query: FuelAnomalySummaryQuery, deps?: ...): Promise<FuelAnomalyDashboardSummary>`.
- Summary returns open counts by severity, risk trend, finding-code distribution, top trucks/routes/stations only when evidence exists, data-quality trend, false-positive/outcome rates, average review duration, AI explanation success/fallback counts, baseline eligibility/sample-size distribution, observer-mode status and ruleset/baseline versions.

- [ ] **Step 1: Write failing query tests** for date/status/severity/truck filters, pagination, detail retrieval with findings/review history, and RBAC-safe response shapes.
- [ ] **Step 2: Write failing observability tests** for finding counts, average confidence/data quality, AI success/fallback rate, baseline sample distributions, review outcome/false-positive rate, time-to-resolution and version comparison; missing route/station evidence must not fabricate labels.
- [ ] **Step 3: Run the query-service tests** and verify RED.
- [ ] **Step 4: Implement read-only Prisma aggregation/query functions**; no risk recalculation and no source-record mutation.
- [ ] **Step 5: Wire GET list/summary/detail endpoints through the query service** with manager/admin RBAC and no internal investigation notes on driver-facing paths.
- [ ] **Step 6: Rerun tests**; expect GREEN.
- [ ] **Step 7: Commit** `feat: add fuel intelligence query and observability APIs`.

### Task 11: Fuel Intelligence Manager/Admin UI

**Files:**
- Create: `src/app/(dashboard)/fuel-intelligence/page.tsx`
- Create: `src/components/fuel-intelligence/FuelIntelligenceDashboard.tsx`
- Create: `src/components/fuel-intelligence/FuelAnomalyAssessmentDetail.tsx`
- Create: `src/components/fuel-intelligence/fuel-intelligence-contract.test.ts`
- Modify navigation/menu only where the existing dashboard pattern requires it.

**Interfaces:**
- Dashboard consumes Task 10 list/summary/detail APIs only; it never recomputes risk client-side.
- Detail review action calls the review endpoint; it never alters source fuel/trip records.

- [ ] **Step 1: Write failing source/component contract tests** requiring severity/status filters, open counts, risk trend, finding-code distribution, top trucks/routes/stations when known, evidence-completeness trend, false-positive/outcome rates, risk/confidence/data-quality display, finding code/reason/evidence, baseline cohort/sample size, explanation clearly labeled non-authoritative, review history, observer-mode/ruleset metadata, and neutral wording such as “Fuel variance review”.
- [ ] **Step 2: Add tests prohibiting accusatory copy** such as “driver stole fuel” and prohibiting client-side score recomputation/source-record mutation calls.
- [ ] **Step 3: Run UI contract tests** and verify RED.
- [ ] **Step 4: Implement responsive dashboard/detail/review UI following existing app components**; add navigation entry for authorized roles only.
- [ ] **Step 5: Rerun UI tests plus lint**; expect GREEN.
- [ ] **Step 6: Commit** `feat: add fuel intelligence review dashboard`.

### Task 12: Real MariaDB Acceptance Suite and CI Gate

**Files:**
- Create: `tests/integration/fuel-anomaly-intelligence.test.ts`
- Modify: `scripts/ci/run-integration-tests.ts`
- Modify: `scripts/ci/run-integration-tests.test.ts`
- Modify: `.github/workflows/ci.yml` only if generation/migration order needs strengthening.

**Interfaces:**
- Integration runner executes Core Integrity suites plus Fuel Anomaly Intelligence against the same isolated disposable MariaDB contract while keeping production-name safeguards.

- [ ] **Step 1: Add a RED integration-runner contract** requiring the new suite to run sequentially under existing database safety guards.
- [ ] **Step 2: Add real MariaDB fixtures** for: normal no-finding trip; capacity exceeded; tolerance boundary; unexplained tank loss; exact duplicate blocked vs near-duplicate flagged; reversal cluster; >=12 truck-route baseline plus outlier; <6 sample suppression; missing GPS/tank data-quality degradation; persisted explanation provenance; review transitions; idempotent rerun; and no source-record mutation.
- [ ] **Step 3: Run the integration runner against disposable MariaDB** and capture RED failures before implementation gaps are fixed.
- [ ] **Step 4: Fix only production gaps exposed by the integration suite** without weakening fixture expectations.
- [ ] **Step 5: Run `bun run test:integration`**; expect all Core Integrity + fuel-intelligence scenarios GREEN.
- [ ] **Step 6: Commit** `test: gate fuel anomaly intelligence on MariaDB`.

### Task 13: Whole-Branch Release Hardening and PR

**Files:**
- Modify only files required by discovered review issues.
- Update plan/spec/PR verification notes only if actual implementation differs materially.

**Interfaces:**
- Final head must remain reviewable against `implementation/ifleetpro-core-integrity-foundation` and must not deploy/migrate production.

- [ ] **Step 1: Run secret-pattern scan and source search** proving no fallback AI key/service URL, credentialed DB URL, sensitive snapshot fields or authority-bearing AI path was introduced.
- [ ] **Step 2: Run `bunx prisma validate && bunx prisma generate`**; expect GREEN.
- [ ] **Step 3: Run `bun run lint && bun run typecheck && bun run test`**; expect 0 new TypeScript diagnostic groups and all unit/contract tests GREEN.
- [ ] **Step 4: Apply all migrations to fresh disposable MariaDB and run `bun run test:integration`**; expect GREEN.
- [ ] **Step 5: Run `bun run build` and `git diff --check`**; expect production build success and clean diff whitespace.
- [ ] **Step 6: Review whole branch against the spec** for authority leakage, false-positive wording, missing evidence behavior, idempotency, provenance completeness, source-record immutability, observability coverage and future-ML label readiness; fix any Important/Critical issues under RED->GREEN tests.
- [ ] **Step 7: Push final branch and open/update a stacked PR targeting `implementation/ifleetpro-core-integrity-foundation`** with observer-mode safety boundary, exact final SHA and CI run evidence.
- [ ] **Step 8: Preserve production block** in PR: no rollout until credential rotation, DB restriction, environment separation, verified backup, deliberate migration baseline adoption and hardened migrate/health/smoke sequence are complete.
- [ ] **Step 9: Commit any final documentation-only adjustments** `docs: finalize fuel anomaly intelligence release evidence`.
