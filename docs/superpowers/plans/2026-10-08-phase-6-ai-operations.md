# Ghana Haulage OS Phase 6 — AI Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trustworthy advisory intelligence for fuel, ETA, queueing, maintenance/safety risk and assignment recommendations, starting with deterministic rules and only enabling learned models after sufficient quality-controlled data exists.

**Architecture:** Create an `ai-ops` domain that consumes normalized, versioned facts from prior phases rather than raw UI state. Every recommendation includes inputs, score components, confidence/data-quality indicators and explanation; final dispatch authority remains human-controlled.

**Tech Stack:** Next.js 16, TypeScript, Prisma/MariaDB, existing telematics/operations/finance data, Vitest; statistical/ML implementation may be introduced behind versioned model interfaces only after deterministic baselines are measured.

**Spec:** `docs/superpowers/specs/2026-10-07-ghana-haulage-os-design.md`

## Global Constraints

- AI is advisory by default and cannot dispatch a truck autonomously in this phase.
- A recommendation must expose reasons/data quality, not only a score.
- No model is trained on untrusted/unknown-source telemetry without explicit quality filtering.
- Fuel anomalies create review cases; they do not accuse a driver automatically.
- Model/version metadata is stored with every persisted prediction/recommendation.
- Deterministic baselines ship before statistical models.

## Review Focus

- Missing/low-quality telemetry must lower confidence instead of inventing precise output.
- A vehicle/driver that fails a blocking eligibility rule must never rank as assignable even if its predicted margin is high.
- Concept drift/model-version changes must not rewrite historical predictions.
- Sparse-new-route history must fall back to route class/global priors and say so.
- Fuel anomaly alerts must distinguish data gaps/sensor faults from suspicious consumption patterns.

---

### Task 1: Add AI advisory record and data-quality framework

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/domain/ai-ops/types.ts`
- Create: `src/lib/domain/ai-ops/data-quality.ts`
- Create: `src/lib/domain/ai-ops/__tests__/data-quality.test.ts`

**Interfaces:**
- Produces `AiRecommendation`, `AiPrediction`, `AiReviewCase` models with `modelKey`, `modelVersion`, `confidence`, `inputSnapshotRef`, `explanation`, `createdAt`.
- Produces `assessDataQuality(input: AiInputFacts): DataQualityAssessment`.

- [ ] Write failing tests for trusted complete data, phone-only fallback, stale telemetry, missing weights/fuel and contradictory sensor/manual data.
- [ ] Run focused tests; expect FAIL.
- [ ] Add schema and data-quality service with explicit issues and confidence ceiling.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add AI advisory and data quality foundation`.

### Task 2: Implement deterministic ETA, dwell and compliance risk intelligence

**Files:**
- Create: `src/lib/domain/ai-ops/eta.ts`
- Create: `src/lib/domain/ai-ops/dwell.ts`
- Create: `src/lib/domain/ai-ops/compliance-risk.ts`
- Create: `src/lib/domain/ai-ops/__tests__/deterministic-intelligence.test.ts`
- Create: `src/app/api/ai-ops/trips/[id]/advisory/route.ts`

**Interfaces:**
- Produces `estimateEta(input): EtaEstimate`, `assessDwell(input): DwellAssessment`, `scoreComplianceRisk(input): ComplianceRisk`.

- [ ] Write failing tests for moving/stopped trips, unknown route history, excessive factory dwell, expiring documents and active compliance hold.
- [ ] Implement deterministic formulas using current progress/historical travel summaries and Phase 1/2 compliance data.
- [ ] Cap confidence using Task 1 data-quality assessment.
- [ ] Add advisory API consumed by Control Tower/trip workspace.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add deterministic ETA dwell and compliance intelligence`.

### Task 3: Add expected-vs-actual fuel anomaly review

**Files:**
- Create: `src/lib/domain/ai-ops/fuel-anomaly.ts`
- Create: `src/lib/domain/ai-ops/__tests__/fuel-anomaly.test.ts`
- Create: `src/app/api/ai-ops/fuel/review-cases/route.ts`
- Create: `src/app/(dashboard)/ai-ops/fuel-review/page.tsx`

**Interfaces:**
- Produces `assessFuelAnomaly(input: FuelAnomalyInput): FuelAnomalyAssessment` with classification `normal | data_issue | review`.

- [ ] Write failing tests for valid refill, impossible purchase > tank capacity, sensor drop while stationary, long idling, missing sensor data, route baseline variance and manual-only evidence.
- [ ] Implement deterministic multi-factor anomaly assessment; do not label theft/fraud.
- [ ] Create review case only above configured threshold and attach evidence/reasons.
- [ ] Build review queue where an authorized user can confirm data error, explain, dismiss or escalate.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add explainable fuel anomaly review`.

### Task 4: Build human-controlled assignment recommendation engine

**Files:**
- Create: `src/lib/domain/ai-ops/assignment.ts`
- Create: `src/lib/domain/ai-ops/__tests__/assignment.test.ts`
- Create: `src/app/api/load-orders/[id]/recommendations/route.ts`
- Modify: `src/components/dispatch/AssignmentDialog.tsx`

**Interfaces:**
- Produces `rankAssignmentCandidates(input: AssignmentRecommendationInput): AssignmentRecommendation[]`.
- Candidate factors: eligibility, deadhead distance, suitability, maintenance health, driver hours, route experience, historical fuel efficiency, on-time history, shipper restrictions and projected margin.

- [ ] Write failing tests proving ineligible candidates are excluded; low-data candidates are down-confidenced; nearer/healthy/experienced candidate ranking; margin cannot override compliance; deterministic tie-break.
- [ ] Implement weighted scoring with configuration stored/versioned server-side, not frontend constants.
- [ ] Persist recommendation snapshot when dispatcher opens/accepts it; human selection remains final.
- [ ] Add explanation panel to assignment dialog showing score components, confidence and any fallback assumptions.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add explainable assignment recommendations`.

### Task 5: Add statistical model interface and offline evaluation gate

**Files:**
- Create: `src/lib/domain/ai-ops/model-registry.ts`
- Create: `src/lib/domain/ai-ops/__tests__/model-registry.test.ts`
- Create: `scripts/ai/export-training-dataset.ts`
- Create: `scripts/ai/evaluate-model.ts`
- Create: `docs/operations/ai-model-promotion.md`

**Interfaces:**
- Produces `AiModelAdapter<Input, Output>` with `modelKey`, `version`, `predict(input)`, `explain(output)`, `minimumDataQuality`.
- Model registry supports `shadow`, `advisory`, `disabled`; no autonomous execution status.

- [ ] Write failing registry tests for unknown/disabled model, version pinning, minimum-quality rejection and historical prediction version preservation.
- [ ] Implement registry/interface without selecting an ML library prematurely.
- [ ] Implement export script that removes direct identity/contact fields and includes only required operational features/labels.
- [ ] Implement evaluation script contract producing metrics + baseline comparison; it must fail promotion when a learned model does not beat the deterministic baseline on predefined acceptance criteria configured per model family.
- [ ] Write promotion runbook requiring documented dataset window, leakage review, holdout metrics, model version and rollback.
- [ ] Run tests and dry-run exporter/evaluator on staging sample; expect PASS.
- [ ] Commit: `feat: add governed AI model registry and evaluation gate`.

### Task 6: Add predictive maintenance/queue/late-delivery shadow-model hooks

**Files:**
- Create: `src/lib/domain/ai-ops/model-features.ts`
- Create: `src/lib/domain/ai-ops/__tests__/model-features.test.ts`
- Create: `src/app/(dashboard)/ai-ops/model-health/page.tsx`

**Interfaces:**
- Produces versioned feature builders `buildMaintenanceFeatures`, `buildQueueFeatures`, `buildLateDeliveryFeatures` from immutable/historical operational data.

- [ ] Write failing feature-builder tests proving point-in-time correctness: features at prediction time cannot include future completion/outcome data.
- [ ] Implement causal feature extraction with explicit `asOf` timestamp.
- [ ] Add model-health page showing shadow/advisory status, sample counts, freshness, data quality, evaluation metrics and drift indicators when available.
- [ ] Do not enable production predictions until a model passes Task 5 promotion gate.
- [ ] Run tests/build; expect PASS.
- [ ] Commit: `feat: add point in time AI feature and model health framework`.

## Phase 6 Exit Gate

iFleetPro provides explainable deterministic ETA/dwell/compliance/fuel and assignment advisories with human control, stores model/version/confidence/data-quality evidence, and has a governed interface for future learned models. No learned prediction is promoted without point-in-time-safe evaluation against its deterministic baseline.
