# iFleetPro Fuel Theft & Anomaly Intelligence — Design

**Date:** 2026-10-07  
**Status:** Proposed for implementation planning  
**Base:** `implementation/ifleetpro-core-integrity-foundation`  
**Architecture branch:** `architecture/ifleetpro-fuel-anomaly-intelligence`

## 1. Purpose

Build a production-safe Fuel Theft & Anomaly Intelligence subsystem that detects fuel irregularities early without treating statistical anomalies as proof of theft or misconduct.

The subsystem must use iFleetPro's authoritative operational data first: verified fuel events, odometer readings, trip reconciliation, truck tank capacity, route/trip context, driver context, receipt metadata, and GPS evidence when available. It must produce reproducible findings with explicit evidence and confidence, preserve a complete audit trail, and keep all disciplinary, financial, verification, and operational actions under human control.

The first production phase is an **observer/review system**, not an autonomous enforcement system.

## 2. Success Criteria

The first release is successful when it can:

1. Detect deterministic fuel-integrity problems from server-owned data without caller-supplied evidence arrays.
2. Detect statistically unusual consumption or refueling patterns only when sufficient history exists.
3. Explain exactly why each finding was created, including source evidence, rule/baseline version, sample size, confidence, and data quality.
4. Avoid fabricating missing GPS, tank, route, distance, price, receipt, or expected-consumption evidence.
5. Persist immutable assessment provenance plus a separate human review lifecycle and final outcome.
6. Keep the LLM explanation-only: it cannot create/remove findings, change scores/severity, identify theft as a fact, alter verified records, or take disciplinary/financial action.
7. Produce identical deterministic findings for identical evidence snapshots and ruleset versions.
8. Run against historical and new records in shadow mode before any workflow gating is considered.
9. Pass real MariaDB integration tests covering deterministic rules, baselines, provenance, review state, and AI fallback behavior.
10. Generate reviewed outcomes that can later become labels for a statistical/ML model without redesigning the audit model.

## 3. Explicit Non-Goals for This Phase

This phase will not:

- automatically accuse a driver, fuel attendant, station, or vendor of theft or fraud;
- automatically suspend a driver or truck;
- automatically fine, debit, claw back, or deduct money;
- automatically reject or reverse a verified fuel event;
- automatically alter odometer, tank, trip, or reconciliation records;
- automatically block a fuel purchase;
- use an LLM score as a risk score;
- train or deploy a black-box ML model before sufficient reviewed history exists;
- infer exact route deviation when no reliable route/GPS evidence exists;
- guess tank capacity, bag-to-tonne conversion, expected fuel efficiency, or missing fuel levels.

## 4. Current System Context

The Core Integrity foundation already provides the authoritative data needed for a safe first release:

- `FuelLog` supports trip/truck linkage, event type, verification status, source, litres, cost, cost/litre, fuel levels, odometer, images, receipt number, GPS, payment source, reversals, and capture identity.
- `OdometerReading` is the authoritative mileage ledger.
- `TripReconciliation` stores authoritative reconciled distance, fuel added, consumed litres, fuel cost, km/L, L/100km, cost/km, exceptions, and reconciliation provenance.
- `Truck` can hold known tank capacity.
- verified fuel events already feed deterministic trip fuel projection/reconciliation.

The existing `/api/ai/fuel-anomaly` path is not acceptable as the production authority boundary because it accepts caller-supplied fuel logs and vehicle information and forwards them directly to the AI service. It also belongs to the older AI pattern. This design replaces that authority model rather than extending it.

## 5. Considered Approaches

### 5.1 LLM-only anomaly analysis

**Pros:** fastest to demo; easy natural-language output.  
**Cons:** non-reproducible, difficult to audit, susceptible to missing-context fabrication, unsafe for accusations, weak numerical authority, and unsuitable for money/discipline decisions.

**Decision:** rejected as the authority layer.

### 5.2 Immediate unsupervised ML

Examples include Isolation Forest, one-class models, clustering, or autoencoders across fuel features.

**Pros:** can eventually catch non-obvious patterns.  
**Cons:** current fleet history may be too small or contaminated; explanations are weaker; route/truck/driver effects can be conflated; label-free outliers generate avoidable false positives; model drift adds operational complexity before deterministic evidence quality is proven.

**Decision:** deferred until reviewed outcomes and sufficient clean history exist.

### 5.3 Deterministic rules + robust statistical baselines + explanation-only AI

**Pros:** immediately useful, reproducible, auditable, safe under sparse data, creates high-quality reviewed labels for future ML, and aligns with the Core Integrity architecture.  
**Cons:** requires explicit engineering of evidence and thresholds; may initially miss complex nonlinear patterns.

**Decision:** selected.

## 6. Architecture

The subsystem is split into isolated units with narrow interfaces.

### 6.1 Fuel Evidence Service

**Responsibility:** build a server-owned, sanitized assessment snapshot.

Inputs are identifiers and scope, not raw evidence arrays. Supported subjects:

- one fuel event;
- one trip;
- one truck over a bounded date window;
- scheduled fleet shadow scan.

It loads only approved fields from:

- verified/pending fuel events as explicitly required by each rule;
- odometer ledger;
- trip reconciliation;
- truck tank capacity and operational identity;
- trip route/zone and driver identifiers;
- historical comparable trips/fuel events;
- GPS coordinates when they actually exist;
- receipt number/station/payment metadata;
- reversals and verification state.

Sensitive personal fields unrelated to fuel analysis must not enter the assessment snapshot or AI payload.

The service records whether each evidence family is `known`, `partial`, or `unavailable`. Missing evidence is itself provenance, not permission to infer a value.

### 6.2 Deterministic Rule Engine

**Responsibility:** evaluate physical, accounting, ledger, duplication, and integrity rules.

Rules are pure functions where practical. Each rule returns zero or more typed findings with:

- rule code;
- ruleset version;
- severity;
- deterministic score contribution;
- evidence references and values;
- human-readable deterministic reason;
- confidence and data-quality contribution;
- affected event/trip/truck identifiers;
- recommended review action.

A rule must not mutate source records.

### 6.3 Robust Baseline Engine

**Responsibility:** detect statistically unusual but not physically impossible patterns.

The engine uses robust statistics, not simple mean/standard-deviation alone. The first implementation should use median and Median Absolute Deviation (MAD), with percentile/IQR fallbacks when MAD is zero or the distribution is highly discrete.

Baseline priority:

1. truck + route/zone cohort;
2. truck cohort;
3. route/zone cohort;
4. comparable fleet cohort.

Driver-specific history may be a secondary contextual feature but must not be the primary baseline when truck/route evidence exists, because mechanical condition, load, road, traffic, and route effects can otherwise be misattributed to the driver.

A baseline is not activated until its minimum sample policy is satisfied. Initial policy:

- preferred: at least 12 comparable reconciled observations;
- advisory: 6–11 comparable observations, with reduced confidence;
- below 6: no statistical anomaly finding from that baseline.

These values are versioned policy constants, not hidden magic numbers.

### 6.4 Assessment Engine

**Responsibility:** orchestrate evidence, rules, baselines, risk aggregation, and persistence.

Flow:

1. Resolve requested subject internally.
2. Load authoritative evidence.
3. Freeze a normalized snapshot and hash it.
4. Run deterministic rules.
5. Run eligible robust baselines.
6. Aggregate findings into an overall assessment score and status.
7. Persist immutable assessment provenance and structured findings.
8. Optionally call the explanation client.
9. Persist explanation audit separately.
10. Return findings for human review.

The assessment is never allowed to edit a verified fuel event, odometer reading, trip reconciliation, driver status, truck status, or balance.

### 6.5 Explanation Client and AI Mini-Service

**Responsibility:** summarize already-created findings only.

The application sends a sanitized payload containing:

- assessment identifier;
- bounded trip/truck/fuel context;
- already-determined findings, severities, scores, evidence summaries, confidence, and data quality;
- explicit instruction that the model has no authority.

The AI response may contain:

- a concise summary;
- explanation text per known finding;
- suggested investigation questions or document checks.

The AI response must not contain authority-bearing changes. The validator rejects output that:

- invents a finding or affected entity;
- removes a supplied finding;
- changes severity, risk score, confidence, or ordering where ordering is server-owned;
- declares theft/fraud as a fact;
- recommends automatic punishment or financial deduction as an executed action;
- includes unknown event/trip/truck/driver IDs.

Provider failure, timeout, malformed output, or rejected output yields deterministic fallback text. The assessment remains usable without AI.

## 7. Deterministic Finding Catalogue

The first release should support the following rule families. Codes are stable external identifiers; wording can evolve independently.

### 7.1 Tank and physical plausibility

- `FUEL_TANK_CAPACITY_EXCEEDED`: a single verified fill exceeds known tank capacity beyond configured measurement tolerance.
- `FUEL_TANK_BALANCE_NEGATIVE`: verified opening/added/closing tank evidence implies physically impossible negative consumption or balance.
- `FUEL_TANK_LOSS_UNEXPLAINED`: reliable tank observations show loss materially greater than reconciled movement/use can explain.
- `FUEL_FILL_LEVEL_CONTRADICTION`: before/after tank observations contradict the recorded litres beyond tolerance.

Unknown tank capacity disables capacity-based findings rather than estimating capacity.

### 7.2 Distance and consumption integrity

- `FUEL_CONSUMPTION_EXTREME_PHYSICAL`: reconciled distance/consumption is outside physically credible configured bounds for the truck class when class evidence is explicitly available.
- `FUEL_ADDED_WITH_NO_DISTANCE`: material fuel addition occurs while authoritative trip distance is zero/near-zero, excluding known operational exceptions.
- `FUEL_DISTANCE_WITH_NO_USABLE_FUEL`: meaningful verified movement exists but available fuel evidence is unexpectedly absent; normally advisory because external/pre-existing tank fuel can explain it.
- `FUEL_RECONCILIATION_EXCEPTION_CLUSTER`: repeated reconciliation exceptions materially reduce confidence and require evidence review.

### 7.3 Duplicate, receipt, and reversal integrity

- `FUEL_NEAR_DUPLICATE_EVENT`: likely duplicate across time/litres/cost/station/receipt dimensions that escaped exact duplicate prevention.
- `FUEL_RECEIPT_REUSE`: the same non-empty receipt identifier is reused across incompatible fuel events.
- `FUEL_REVERSAL_PATTERN`: unusually frequent or chained reversals requiring review.
- `FUEL_POST_VERIFICATION_REVERSAL_CLUSTER`: repeated reversals of previously verified events within a policy window.

These findings must distinguish legitimate corrections from suspicious patterns and never treat a reversal alone as misconduct.

### 7.4 Price and purchase pattern

- `FUEL_PRICE_OUTLIER`: cost/litre is materially outside the relevant station/date/fuel-type or fleet baseline when enough comparable evidence exists.
- `FUEL_FILL_FREQUENCY_OUTLIER`: refueling frequency materially exceeds comparable truck/route behavior.
- `FUEL_VOLUME_OUTLIER`: litres added materially exceed robust comparable baselines without a physical impossibility.
- `FUEL_COST_OUTLIER`: trip fuel cost is anomalous after normalizing for distance and available route/truck context.

### 7.5 Efficiency baseline

- `FUEL_EFFICIENCY_DEGRADATION`: reconciled km/L or L/100km shows sustained deterioration relative to a valid truck/truck-route baseline.
- `FUEL_EFFICIENCY_SINGLE_OUTLIER`: one reconciled trip is a robust statistical outlier but not yet a sustained pattern.

The sustained finding should generally carry greater confidence than a single statistical outlier.

### 7.6 Location evidence

- `FUEL_LOCATION_OUTSIDE_EXPECTED_AREA`: reliable fueling GPS is materially inconsistent with available route/depot/station geography.
- `FUEL_LOCATION_EVIDENCE_MISSING`: optional informational/data-quality finding only when the operating policy expected GPS evidence for that capture source.

No off-route claim may be made if authoritative route/geofence evidence is unavailable.

## 8. Severity and Risk Aggregation

Findings use `info`, `low`, `medium`, `high`, or `critical` severity.

`critical` is reserved for strong physical/accounting contradictions or repeated high-confidence patterns. A statistical outlier alone cannot be `critical` in the first release.

Overall risk is deterministic and explainable. Each finding contributes a bounded weighted score based on:

- rule class;
- evidence strength;
- confidence;
- data quality;
- recurrence/sustained-pattern evidence.

Multiple findings from the same underlying evidence must use a correlation cap so duplicate rules do not inflate overall risk unfairly.

Initial overall bands:

- `0–19`: informational;
- `20–39`: low review priority;
- `40–59`: medium;
- `60–79`: high;
- `80–100`: critical review priority only when at least one strong-evidence rule supports the band; otherwise cap at high.

These bands and weights are versioned and tested.

## 9. Confidence and Data Quality

Risk and confidence are separate concepts.

- **Risk score** answers: how concerning are the observed indicators?
- **Confidence** answers: how strongly does the available evidence support those indicators?
- **Data quality** answers: how complete and authoritative is the underlying evidence?

Evidence weights should prefer, in order:

1. verified ledger/reconciliation data;
2. system/provider-captured observations;
3. manager/admin-verified manual evidence;
4. pending/manual evidence;
5. unavailable evidence.

Missing evidence must reduce confidence/data quality and may suppress rules that require it.

## 10. Persistence Model

Use structured persistence rather than a single opaque AI JSON blob.

### 10.1 `FuelAnomalyAssessment`

Recommended fields:

- `id`
- subject type and subject identifier (`fuel_event`, `trip`, `truck_window`)
- optional `fuelLogId`, `tripId`, `truckId`
- `requestedBy` / automated scan actor
- `requestedAt`
- `rulesetVersion`
- `baselineVersion`
- `inputHash`
- `inputSnapshot` (`LONGTEXT`, sanitized JSON)
- `overallRiskScore`
- `overallSeverity`
- `confidence`
- `dataQuality`
- `status` (`open`, `acknowledged`, `investigating`, `resolved`, `false_positive`)
- explanation audit: `explanationSource`, `provider`, `model`, `explanationOutput`, `explanationAt`
- human review: `reviewedBy`, `reviewedAt`, `reviewNotes`
- final outcome code
- `createdAt`, `updatedAt`

### 10.2 `FuelAnomalyFinding`

Recommended fields:

- `id`
- `assessmentId`
- stable `code`
- `severity`
- deterministic `riskContribution`
- `confidence`
- `dataQuality`
- `evidence` sanitized JSON
- deterministic `reason`
- `recommendedAction`
- optional related `fuelLogId`, `tripId`, `truckId`, `driverId`
- `createdAt`

Findings created from an assessment snapshot are immutable. Human review changes the assessment review state/outcome, not the historical finding itself.

### 10.3 `FuelAnomalyReviewEvent`

Review history is append-only so acknowledgement, investigation, resolution, false-positive classification, reopening, and outcome changes remain auditable. Recommended fields:

- `id`
- `assessmentId`
- `fromStatus`, `toStatus`
- optional `outcomeCode`
- optional `notes`
- `actorId`
- `createdAt`

The assessment row stores the current review projection for efficient queries; `FuelAnomalyReviewEvent` is the authoritative transition history. Reopening never deletes or rewrites a prior resolution event.

## 11. Review Lifecycle

Human review states:

`open → acknowledged → investigating → resolved | false_positive`

Allowed transitions are enforced server-side and recorded with actor/time/notes. Reopening a resolved assessment creates a review-history entry rather than erasing the original decision.

Recommended outcome codes include:

- `verified_legitimate`
- `data_entry_error`
- `duplicate_record`
- `mechanical_issue`
- `route_or_operational_factor`
- `supplier_or_price_issue`
- `fuel_loss_confirmed`
- `policy_violation_confirmed`
- `insufficient_evidence`
- `other`

Outcome labels describe the reviewed evidence. The system should avoid a generic `theft_confirmed` label unless a later policy explicitly defines who is authorized to make that determination and what evidence standard applies.

## 12. API Boundary

### 12.1 Assessment request

A manager/admin endpoint accepts identifiers and scope only, for example:

- `{ fuelLogId }`
- `{ tripId }`
- `{ truckId, startDate, endDate }`

It rejects caller-supplied fuel logs, baseline arrays, scores, findings, driver histories, or vehicle evidence.

### 12.2 Assessment retrieval

Read endpoints expose assessment/finding evidence according to RBAC. Driver-facing surfaces must not expose accusatory internal investigation notes.

### 12.3 Review endpoint

Managers/admins can change review state and save review notes/outcomes. This endpoint must not alter verified source fuel/odometer/reconciliation records.

### 12.4 Shadow scan

A scheduled/server-owned scan can evaluate newly verified events or recently reconciled trips. The scan is idempotent for the same subject + ruleset + evidence hash and must not create duplicate assessments for identical evidence.

## 13. UI/UX

### 13.1 Fuel Intelligence dashboard

Manager/admin dashboard includes:

- open assessments by severity;
- risk trend over time;
- finding-code distribution;
- top affected trucks/routes/stations when evidence exists;
- evidence-completeness/data-quality trend;
- false-positive/resolution outcome rates;
- observer-mode status and ruleset version.

### 13.2 Assessment detail

Show:

- neutral heading such as **Fuel variance review** or **Fuel anomaly assessment**;
- overall risk, confidence, data quality;
- deterministic findings and their evidence;
- comparison baseline with sample size and cohort type;
- timeline of related fuel events/reversals;
- reconciliation metrics;
- AI summary clearly marked as explanatory, not authoritative;
- review status, notes, and final outcome history.

Wording should say “requires review”, “unusual pattern”, “variance”, or “integrity finding”, not “driver stole fuel”.

## 14. Observer-Mode Rollout

### Phase A — historical shadow evaluation

Run the engine over a bounded sample of historical reconciled trips/fuel events. No user-facing alerts are sent. Engineers/managers inspect false positives and threshold behavior.

### Phase B — live shadow mode

New eligible records are assessed automatically, but findings appear only in the Fuel Intelligence dashboard. No workflow blocking.

### Phase C — reviewed operational alerts

After acceptable false-positive behavior, high-confidence/high-risk assessments may generate manager notifications. Still no automatic punishment, money movement, or source-record mutation.

Any future workflow gating must be designed as a separate approved phase using reviewed production evidence.

## 15. Testing Strategy

### 15.1 Pure unit tests

Cover:

- tank-capacity exact boundary and tolerance behavior;
- tank-balance equations;
- zero/negative/unknown distance cases;
- reversal and near-duplicate patterns;
- repeated receipt identifiers;
- robust median/MAD outlier behavior;
- MAD-zero fallback behavior;
- minimum baseline sample policy;
- cohort fallback order;
- severity/risk aggregation and correlation caps;
- confidence/data-quality degradation under missing evidence;
- identical input snapshot produces identical deterministic output.

### 15.2 Authority/security contract tests

Prove:

- API accepts identifiers/scope, not caller-owned evidence arrays;
- no fallback internal credential exists;
- sensitive fields are excluded from stored/AI snapshots;
- AI output cannot change score/severity/findings;
- invented IDs/findings are rejected;
- provider errors/timeouts fall back deterministically;
- review endpoints do not mutate source fuel/odometer/reconciliation records.

### 15.3 Real MariaDB integration fixtures

At minimum exercise:

1. normal trip/fuel sequence with no findings;
2. known tank capacity exceeded;
3. valid tank math at tolerance boundary;
4. unexplained tank loss;
5. exact duplicate blocked by existing fuel service and near-duplicate flagged by intelligence engine;
6. reversal cluster;
7. truck-route baseline with sufficient samples and one statistical outlier;
8. insufficient baseline sample produces no statistical finding;
9. missing GPS/tank evidence lowers data quality without fabrication;
10. persisted assessment + immutable findings + explanation audit + human review transition;
11. re-running identical subject/evidence/ruleset is idempotent;
12. no assessment action creates/updates a source trip/fuel/odometer record.

## 16. Security and Privacy

- Server owns all evidence queries.
- Existing fail-closed AI service configuration pattern must be reused.
- Fuel anomaly analysis must not restore any hardcoded internal API key or service URL.
- Stored snapshots and AI payloads use explicit allow-lists.
- Personal identifiers unrelated to analysis are excluded.
- Evidence URLs/images are referenced by authorized identifiers/URLs as needed; raw private image contents should not be copied into general audit JSON unless explicitly required.
- RBAC restricts investigation views to authorized operational/management roles.
- Historical secret exposure remains a separate production prerequisite; this subsystem must not be deployed until foundation production controls are satisfied.

## 17. Observability

Track operational metrics without sensitive payloads:

- assessments created by subject type;
- findings by code/severity;
- average confidence/data quality;
- AI explanation success/fallback rate;
- baseline eligibility/sample-size distribution;
- review outcomes and false-positive rate;
- time from open to reviewed/resolved;
- ruleset-version comparison during shadow rollout.

Logs must use assessment/finding IDs rather than dumping full evidence snapshots.

## 18. Versioning and Reproducibility

Every persisted assessment records:

- deterministic ruleset version;
- baseline policy version;
- evidence hash;
- input snapshot;
- generated findings;
- explanation provider/model/source when used;
- reviewer outcome.

Changing weights, thresholds, tolerance values, or baseline policy requires a new version. Historical assessments are not silently recomputed in place. A re-evaluation creates a new assessment linked to the same subject and newer version/evidence hash.

## 19. Future ML Path

ML is intentionally a follow-on phase.

Reviewed assessments provide training labels and false-positive feedback. Once sufficient clean data exists, candidate models can be evaluated offline against a time-split holdout. A future model may contribute an additional bounded feature/risk signal, but deterministic hard-integrity rules remain separately visible and cannot be suppressed by the model.

Any ML release must record model/provider/version/features/output/confidence and must pass precision/recall, false-positive, calibration, drift, and explainability gates appropriate to the available dataset before entering shadow mode.

## 20. Implementation Boundaries

Likely implementation areas after plan approval:

- `src/lib/domain/fuel-intelligence/` — pure rules, robust baseline/statistics, scoring/types;
- `src/lib/services/fuel-anomaly-evidence-service.ts` — authoritative evidence loader;
- `src/lib/services/fuel-anomaly-assessment-service.ts` — orchestration/persistence/review;
- `src/lib/ai/fuel-anomaly/` — sanitized explanation payload/client/validator;
- `src/app/api/ai/fuel-anomaly/` — replacement authenticated thin API;
- `mini-services/ai-service/` — explanation-only fuel-anomaly contract;
- Prisma multi-file schema + additive migration;
- Fuel Intelligence manager/admin UI;
- integration fixtures and CI runner extensions.

These boundaries are directional, not permission to implement before the implementation plan is approved.

## 21. Release Gate

The subsystem is eligible for review when:

- deterministic and baseline tests are green;
- Prisma schema/client/migrations validate on disposable MariaDB;
- source-owned evidence and sensitive-field contracts are green;
- real MariaDB scenarios pass;
- AI explanation-only contracts pass;
- review-state and idempotency tests pass;
- no new TypeScript baseline diagnostic groups are introduced;
- production build passes;
- no production database migration/deployment has been performed;
- PR remains stacked on the Core Integrity foundation until the foundation rollout prerequisites are resolved.

## 22. Production Prerequisites

This design does not change the existing production safety prerequisites. Before any production rollout, the project still requires:

1. rotation of historically exposed database/API/webhook/admin credentials;
2. restricted/private database network exposure;
3. separated dev/staging/production credentials and databases;
4. verified production backup/checkpoint;
5. deliberate baseline adoption for the existing production database;
6. reviewed `prisma migrate deploy` rollout with health and smoke gates.

Fuel Intelligence should first enter observer mode only after those controls are satisfied.
