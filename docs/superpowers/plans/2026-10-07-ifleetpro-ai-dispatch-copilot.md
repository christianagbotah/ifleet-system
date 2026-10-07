# iFleetPro AI Dispatch Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe, explainable AI-assisted dispatch copilot that ranks eligible truck/driver combinations from authoritative fleet data, preserves human control, and never lets an LLM bypass compliance or mutate assignments autonomously.

**Architecture:** The Next.js application remains the authority for candidate discovery, eligibility and scoring. Deterministic domain functions apply hard exclusions first, then score safe driver/truck pairs from normalized operational evidence; the AI mini-service may add natural-language explanations only for the already-approved candidate IDs and scores. Recommendations and human decisions are persisted for audit/provenance, while accepting a recommendation only prefills the trip form—the existing trip creation workflow remains the final transactional assignment action.

**Tech Stack:** Next.js 16, TypeScript, Bun test, Prisma 7.8, MariaDB, React 19, Zod 4, existing Groq-backed `mini-services/ai-service`, existing iFleetPro CI/type-debt/migration gates.

**Spec:** `docs/superpowers/specs/2026-10-06-ifleetpro-core-integrity-ai-design.md`

## Global Constraints

- Hard safety/compliance rules are authoritative; LLM output may never override an ineligible driver or truck.
- Driver/truck assignment remains human-confirmed. No AI endpoint creates, updates, starts, completes, or financially closes a trip.
- The server builds candidate pools from the database; callers may not supply authoritative `availableDrivers`/`availableTrucks` lists.
- Never send sensitive identity data such as Ghana Card numbers, phone numbers, raw licence numbers, passwords, tokens, or unrelated personal data to the model provider.
- Missing operational data must reduce confidence/data-quality or produce neutral score components; never invent capacity, distance, compliance, location, fuel efficiency or route familiarity.
- Every recommendation stores provider/model/ruleset version, input snapshot/hash, deterministic score components, confidence/data quality, output, human decision and final outcome linkage where available.
- `INTERNAL_API_KEY` and AI service endpoint configuration must fail closed; no production fallback secret or hard-coded production service dependency.
- The deterministic dispatch result must remain usable when the external AI provider or mini-service is unavailable.
- All new database changes use reviewed Prisma migrations, never `prisma db push`.
- Existing foundation gates remain required: tracked-secret scan, lint, no-new-TypeScript-debt, unit tests, Prisma validation, MariaDB migrations/integration tests and production build.

## Review Focus

1. **Expired or ambiguous compliance:** an otherwise high-performing driver/truck with expired/unknown required compliance must not silently rank as eligible; tests pin hard exclusion vs explicit `unknown_data` behavior.
2. **Concurrent assignment race:** a recommendation may become stale after another dispatcher assigns the resource; trip creation remains authoritative and the UI must surface a stale recommendation instead of bypassing current availability.
3. **Missing capacity/telemetry/history:** no guessed capacity, location, route familiarity or fuel-efficiency values; scoring remains deterministic with neutral components and lower data quality.
4. **Malicious or malformed model output:** unknown candidate IDs, altered scores, prompt text, invalid JSON or provider failure cannot change deterministic ranking; the application falls back to deterministic explanations.
5. **Sensitive-data leakage:** model payload tests ensure only approved feature fields leave the application and no phone, Ghana Card, raw licence number, internal notes, secrets or unrelated user data are included.

---

## File Structure

### New application files
- `src/lib/ai/dispatch/types.ts` — canonical dispatch request, eligibility, score, recommendation and provenance types.
- `src/lib/ai/dispatch/eligibility.ts` — pure hard-rule evaluator for drivers and trucks.
- `src/lib/ai/dispatch/scoring.ts` — pure deterministic pair scoring and confidence/data-quality calculation.
- `src/lib/ai/dispatch/model-payload.ts` — allow-listed minimal payload builder for optional explanation service.
- `src/lib/services/dispatch-copilot-service.ts` — database candidate discovery, normalization, ranking, persistence and decision recording.
- `src/lib/config/ai-service.ts` — fail-closed AI service configuration.
- `src/components/trips/DispatchCopilotPanel.tsx` — dispatcher-facing recommendation UI.
- `src/app/api/ai/dispatch-suggest/[id]/decision/route.ts` — human accept/reject decision endpoint.

### Existing files to modify
- `src/app/api/ai/dispatch-suggest/route.ts` — thin authenticated route using authoritative service; remove caller-supplied candidate authority and fallback secret.
- `src/components/trips/TripFormDialog.tsx` — launch copilot and apply an accepted recommendation to form fields without submitting trip.
- `mini-services/ai-service/index.ts` — require internal key, consume safe ranked candidate payload, validate/return explanation-only output.
- `prisma/schema.prisma` — recommendation/decision audit model(s) and relations/indices.
- `.env.example` — explicit `AI_SERVICE_URL`, `INTERNAL_API_KEY`, provider/model configuration placeholders.
- `.github/workflows/ci.yml` / integration fixtures only if needed to exercise the new migration and service flow.

### New tests
- `src/lib/ai/dispatch/eligibility.test.ts`
- `src/lib/ai/dispatch/scoring.test.ts`
- `src/lib/ai/dispatch/model-payload.test.ts`
- `src/lib/config/ai-service.test.ts`
- `src/lib/services/dispatch-copilot-service.test.ts`
- `src/app/api/ai/dispatch-suggest/route-contract.test.ts`
- `src/components/trips/dispatch-copilot-contract.test.ts`
- `mini-services/ai-service/dispatch-explainer.test.ts` (or focused contract test if handler remains in `index.ts`)
- `tests/integration/dispatch-copilot.test.ts`

---

### Task 1: Fail-closed AI service boundary

**Files:**
- Create: `src/lib/config/ai-service.ts`
- Test: `src/lib/config/ai-service.test.ts`
- Modify: `src/app/api/ai/dispatch-suggest/route.ts`
- Modify: `mini-services/ai-service/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `getAiServiceConfig(env?: NodeJS.ProcessEnv): { url: string; internalApiKey: string }`
- Produces: mini-service API-key verification that has no literal fallback credential.
- Later tasks consume this configuration only for optional explanation calls.

- [ ] **Step 1: Write failing configuration/security tests**

Pin that missing/blank `AI_SERVICE_URL` or `INTERNAL_API_KEY` fails closed, explicit values are returned unchanged/normalized, and the dispatch route/mini-service contain no fallback string such as `ifleetpro-internal-key-change-me`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test src/lib/config/ai-service.test.ts`

Expected: FAIL because the helper does not exist and legacy fallback strings remain.

- [ ] **Step 3: Implement fail-closed configuration**

Implement `getAiServiceConfig()` and remove fallback secrets/hard-coded dispatch service authority. Keep provider failure non-fatal to deterministic ranking in later service code.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test src/lib/config/ai-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "security: fail closed for dispatch AI service configuration"`

---

### Task 2: Recommendation provenance and human-decision schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_dispatch_copilot/migration.sql`
- Test: extend `src/lib/domain/schema-contract.test.ts` or add `src/lib/ai/dispatch/schema-contract.test.ts`

**Interfaces:**
- Produces model `DispatchRecommendation` with one immutable recommendation snapshot per request.
- Produces optional `DispatchRecommendationDecision` or equivalent decision fields with actor/time/decision/reason.
- Later service tasks persist ranking provenance through these models.

- [ ] **Step 1: Write failing schema contract tests**

Require fields sufficient for: `id`, optional `tripId`, `requestedBy`, `requestedAt`, `rulesetVersion`, `provider`, `model`, `inputHash`, `inputSnapshot`, `rankedOutput`, `confidence`, `dataQuality`, `status`, decision actor/time/reason, selected driver/truck IDs and created/updated timestamps. Require indices for request time, trip, status and selected resources.

- [ ] **Step 2: Run schema contract and verify RED**

Run: `bun test src/lib/ai/dispatch/schema-contract.test.ts`

Expected: FAIL because provenance model is absent.

- [ ] **Step 3: Add Prisma model(s) and additive migration**

Use JSON/Text columns according to current MariaDB/Prisma support in this repo. Do not store secrets or raw sensitive identity values in snapshots.

- [ ] **Step 4: Validate migration on isolated MariaDB**

Run the existing CI migration flow against the disposable integration database.

Expected: baseline + foundation + dispatch migration apply without destructive drops.

- [ ] **Step 5: Regenerate Prisma client and run schema tests**

Expected: PASS and no new baseline TypeScript diagnostics.

- [ ] **Step 6: Commit**

`git commit -m "feat: add dispatch recommendation provenance ledger"`

---

### Task 3: Deterministic eligibility engine

**Files:**
- Create: `src/lib/ai/dispatch/types.ts`
- Create: `src/lib/ai/dispatch/eligibility.ts`
- Test: `src/lib/ai/dispatch/eligibility.test.ts`

**Interfaces:**
- Produces `evaluateDriverEligibility(candidate, context, now): EligibilityResult`.
- Produces `evaluateTruckEligibility(candidate, context, now): EligibilityResult`.
- `EligibilityResult = { eligible: boolean; hardBlocks: EligibilityReason[]; warnings: EligibilityReason[]; missingData: string[] }`.
- Hard blocks include inactive/suspended resource, expired driver licence, explicit failed/expired verification when required, truck maintenance/out-of-service state, active conflicting trip, and explicit expired required compliance evidence.

- [ ] **Step 1: Write driver eligibility RED tests**

Cover active+valid driver; suspended driver; expired licence; conflicting active trip; verified vs explicit expired/rejected verification; exact departure-time boundary.

- [ ] **Step 2: Write truck eligibility RED tests**

Cover active truck; maintenance/out-of-service; conflicting active trip; explicit expired insurance/roadworthiness/DVLA where authoritative records are available; missing optional compliance data reported separately rather than fabricated.

- [ ] **Step 3: Run tests and verify RED**

Run: `bun test src/lib/ai/dispatch/eligibility.test.ts`

- [ ] **Step 4: Implement pure eligibility functions**

No database calls, no LLM calls, no mutable globals. Inputs are normalized evidence only.

- [ ] **Step 5: Run tests and verify GREEN**

Expected: all eligibility fixtures pass.

- [ ] **Step 6: Commit**

`git commit -m "feat: add deterministic dispatch eligibility rules"`

---

### Task 4: Explainable deterministic scoring

**Files:**
- Create: `src/lib/ai/dispatch/scoring.ts`
- Test: `src/lib/ai/dispatch/scoring.test.ts`

**Interfaces:**
- Produces `scoreDispatchPair(driver, truck, context): DispatchPairScore`.
- `DispatchPairScore` includes `score` (0–100), `components`, `confidence` (0–1), `dataQuality` (0–1), `reasons`, and candidate IDs.
- Component names: `availability`, `compliance`, `routeExperience`, `historicalPerformance`, `fuelEfficiency`, `maintenanceReadiness`, `workloadBalance`, `locationFit`, `capacityFit`.
- Unknown data uses a neutral component and lowers `dataQuality`; no guessed evidence.

- [ ] **Step 1: Write fixed-weight RED tests**

Pin weights/version as a named `DISPATCH_RULESET_VERSION` constant. Include fixtures where a compliant medium-performance pair beats an ineligible pair regardless of performance; missing optional evidence cannot create an artificial advantage.

- [ ] **Step 2: Add fairness/normalization tests**

Route/truck/load difficulty must not penalize a driver when evidence is absent. Workload balancing uses bounded recent workload, not protected/sensitive personal traits.

- [ ] **Step 3: Run tests and verify RED**

Run: `bun test src/lib/ai/dispatch/scoring.test.ts`

- [ ] **Step 4: Implement scoring and stable tie-breaks**

Tie-break order: higher deterministic score, higher data quality, lower current workload, then stable driverId/truckId ordering to keep repeated runs deterministic.

- [ ] **Step 5: Run tests and verify GREEN**

- [ ] **Step 6: Commit**

`git commit -m "feat: add explainable dispatch scoring"`

---

### Task 5: Authoritative candidate discovery and ranking service

**Files:**
- Create: `src/lib/services/dispatch-copilot-service.ts`
- Test: `src/lib/services/dispatch-copilot-service.test.ts`
- Modify Prisma selects only as required; avoid broad personal-data loads.

**Interfaces:**
- Produces `getDispatchRecommendations(input: DispatchRequest, actor: AuthContext, deps?): Promise<DispatchRecommendationResult>`.
- Produces `recordDispatchDecision(recommendationId, decision, actor, deps?): Promise<...>`.
- Accepts either `tripId` or a validated `tripDraft`; it never accepts authoritative driver/truck candidate arrays.

- [ ] **Step 1: Write service RED tests for database candidate sourcing**

Assert only active candidate records are loaded with allow-listed fields; active-trip conflicts are recognized; sensitive driver fields are not selected.

- [ ] **Step 2: Write ranking/persistence RED tests**

Assert ineligible resources never appear in ranked recommendations; top N is deterministic; empty eligible pool returns structured reasons; input/output provenance is persisted.

- [ ] **Step 3: Write stale-decision RED test**

A previously recommended pair that has become unavailable may be recorded as selected by the user for audit, but the service returns `stale: true`; it must not mutate a trip or resource assignment.

- [ ] **Step 4: Implement candidate discovery, normalization, scoring and persistence**

Use current `Trip`, `Driver`, `Truck`, compliance, maintenance, reconciliation/performance and zone benchmark data where actually available. Missing evidence is explicit.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `bun test src/lib/services/dispatch-copilot-service.test.ts`

- [ ] **Step 6: Commit**

`git commit -m "feat: rank authoritative dispatch candidates"`

---

### Task 6: Safe model payload and explanation-only AI adapter

**Files:**
- Create: `src/lib/ai/dispatch/model-payload.ts`
- Test: `src/lib/ai/dispatch/model-payload.test.ts`
- Modify: `mini-services/ai-service/index.ts`
- Test: `mini-services/ai-service/dispatch-explainer.test.ts` or equivalent contract test.

**Interfaces:**
- Produces `buildDispatchExplanationPayload(result): DispatchExplanationPayload` containing candidate IDs, deterministic scores/components, non-sensitive route/cargo context, data-quality flags and reason codes only.
- AI response may return `summary` and explanation text keyed to supplied candidate IDs. It may not return or override eligibility/score/assignment fields.

- [ ] **Step 1: Write sensitive-data allow-list RED test**

Fixture includes phone, Ghana Card, raw licence number, email, internal notes and secrets upstream; assert none appear in serialized model payload.

- [ ] **Step 2: Write malformed/model-manipulation RED tests**

Unknown candidate ID, altered score, extra candidate, invalid JSON and provider timeout must not change deterministic result. Expected fallback: deterministic reasons plus `explanationSource: "deterministic"`.

- [ ] **Step 3: Implement allow-listed payload builder**

- [ ] **Step 4: Refactor mini-service dispatch handler to explanation-only structured output**

Use temperature suitable for stable explanation, validate parsed JSON, and return no authority-bearing fields.

- [ ] **Step 5: Run tests and verify GREEN**

- [ ] **Step 6: Commit**

`git commit -m "feat: constrain AI to dispatch explanations"`

---

### Task 7: Authenticated dispatch API and decision endpoint

**Files:**
- Modify: `src/app/api/ai/dispatch-suggest/route.ts`
- Create: `src/app/api/ai/dispatch-suggest/route-contract.test.ts`
- Create: `src/app/api/ai/dispatch-suggest/[id]/decision/route.ts`
- Add focused decision route test.

**Interfaces:**
- `POST /api/ai/dispatch-suggest` accepts validated `{ tripId }` or `{ tripDraft }` and returns persisted deterministic recommendations with optional explanations.
- `POST /api/ai/dispatch-suggest/:id/decision` accepts `{ decision: "accepted" | "rejected", selectedDriverId?, selectedTruckId?, reason? }`.
- Both are Admin/Manager scoped. Dispatcher role may be added only if existing RBAC explicitly grants dispatch authority; do not infer by role label alone.

- [ ] **Step 1: Write route-contract RED tests**

Require role guard, Zod validation, no `availableDrivers`/`availableTrucks` authority, dispatch service delegation, safe domain-error mapping, and no direct trip mutation.

- [ ] **Step 2: Implement thin routes**

- [ ] **Step 3: Run route tests and verify GREEN**

- [ ] **Step 4: Commit**

`git commit -m "feat: expose safe dispatch copilot API"`

---

### Task 8: Human-in-the-loop trip-form UX

**Files:**
- Create: `src/components/trips/DispatchCopilotPanel.tsx`
- Modify: `src/components/trips/TripFormDialog.tsx`
- Test: `src/components/trips/dispatch-copilot-contract.test.ts`

**Interfaces:**
- Panel inputs: current trip draft fields relevant to dispatch.
- Panel output: accepted `{ driverId, truckId, recommendationId }` applied to form only.
- UI never auto-submits the trip.

- [ ] **Step 1: Write UI contract RED test**

Assert an `AI Suggest`/`Dispatch Copilot` control exists only in creation/edit context where applicable, recommendation cards show score, confidence/data quality, hard evidence/reasons, warnings and stale state, and no recommendation calls trip submit automatically.

- [ ] **Step 2: Implement loading/empty/error/fallback states**

When AI explanation is unavailable but deterministic ranking succeeds, show the deterministic recommendation instead of a generic failure.

- [ ] **Step 3: Implement acceptance behavior**

Accepting a recommendation records the decision, rechecks stale state server-side, then sets `truckId` and `driverId` in the form. User still presses the existing Save/Create Trip action.

- [ ] **Step 4: Add explicit evidence labels**

Examples: `Eligible`, `Licence valid`, `No active trip`, `Route history available`, `Fuel-efficiency history unavailable`, `Compliance data incomplete`. Avoid accusatory or opaque labels.

- [ ] **Step 5: Run UI contract + relevant trip tests and verify GREEN**

- [ ] **Step 6: Commit**

`git commit -m "feat: add human-in-loop dispatch copilot UI"`

---

### Task 9: Real MariaDB integration and CI release gate

**Files:**
- Create: `tests/integration/dispatch-copilot.test.ts`
- Extend fixtures under `tests/fixtures/` as needed.
- Modify `.github/workflows/ci.yml` only if current integration command does not automatically include the new test.

**Interfaces:**
- Exercises real MariaDB candidate data, recommendation persistence and decision recording.
- Does not call the external model provider in CI; explanation adapter is stubbed/fallback to deterministic mode.

- [ ] **Step 1: Add integration fixture**

Create at least: one fully eligible pair, one expired-licence driver, one truck in maintenance, one conflicting active assignment, one candidate with missing optional history, and one valid alternative.

- [ ] **Step 2: Prove ranking/exclusion against real MariaDB**

Assert blocked resources never rank, eligible pair ordering is deterministic, recommendation provenance is saved, and no assignment/trip mutation occurs.

- [ ] **Step 3: Prove stale recommendation behavior**

After recommendation creation, create a conflicting trip for the selected pair, then record acceptance and assert it is flagged stale without changing the new/existing trip assignment.

- [ ] **Step 4: Run full release gate**

Required commands/gates: tracked-secret scan, lint, baseline typecheck, unit tests, Prisma validation, `prisma migrate deploy` on disposable MariaDB, integration tests, production build.

Expected: all green with 0 new TypeScript diagnostic groups.

- [ ] **Step 5: Open/update PR and request whole-branch review**

Base this AI PR on the verified foundation branch/PR until foundation production prerequisites are complete; do not retarget to `main` prematurely.

- [ ] **Step 6: Commit any final test wiring**

`git commit -m "test: gate dispatch copilot on real MariaDB"`

---

## Acceptance Gates

The Dispatch Copilot phase is complete only when all are true:

- Server—not client—constructs candidate pools from authoritative data.
- Ineligible driver/truck resources can never be returned as selectable recommendations.
- Scores are deterministic, bounded, componentized and reproducible for the same evidence snapshot.
- Missing data is visible and reduces confidence/data quality; it is never guessed.
- Sensitive driver/resource data does not enter the model payload.
- AI provider/model failure leaves deterministic dispatch recommendations usable.
- Model output cannot add a candidate or alter score/eligibility.
- Recommendation provenance and human decisions are auditable.
- Accepting a recommendation only prefills the trip form and cannot create/update a trip autonomously.
- Stale recommendations are detected before form application/decision completion.
- Real MariaDB tests prove exclusions, ranking, persistence and stale-state behavior.
- Full foundation CI remains green with 0 new TypeScript debt.

## Self-Review

- **Spec coverage:** This plan implements the approved AI Dispatch Copilot only. Fuel anomaly/theft intelligence, predictive maintenance, route/ETA, document intelligence, driver scoring and management copilot intentionally remain separate plans so each can ship/test independently.
- **Step scan:** Every task has a RED test, a minimal implementation target, a GREEN verification and an independent commit boundary.
- **Type consistency:** Eligibility feeds scoring; scoring feeds the authoritative service; the service persists provenance and builds the model payload; API/UI consume the persisted recommendation IDs. The LLM adapter never owns eligibility/score fields.
- **Review Focus coverage:** compliance ambiguity → Task 3; concurrent/stale assignment → Tasks 5/9; missing data → Tasks 3/4; malformed model output → Task 6; sensitive-data leakage → Task 6.
- **Proportion:** The plan deliberately avoids implementing generic ML infrastructure or the other AI subsystems. It reuses the current Groq mini-service only as an optional explainer and keeps the core recommendation engine deterministic and server-owned.
