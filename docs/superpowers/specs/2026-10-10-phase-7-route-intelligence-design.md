# iFleetPro Phase 7 — Route Intelligence Design

**Date:** 2026-10-10  
**Status:** Approved by standing project ownership mandate  
**Repository:** `christianagbotah/ifleet-system`  
**Base:** Phase 6 governed AI operations on `main`

## 1. Purpose

Phase 7 turns the existing Route Optimizer prototype into an operationally safe advisory layer for Ghana haulage. The current screen and `/api/routes/optimize` endpoint are useful demonstrations, but they mix a static city-distance matrix, stale trip-derived truck locations, last-fill fuel levels and unconstrained active-truck ranking. Those signals are not sufficient for dispatch decisions.

The hardened Route Intelligence feature must use the trustworthy foundations already delivered in Phases 1–6: dispatch eligibility, active assignment constraints, telematics live state, planned routes/geofences, historical trip evidence, configurable shipper rules and governed advisory semantics.

## 2. Safety and authority boundary

Route Intelligence is advisory only.

- It may estimate routes, deadhead, fuel use, ETA and candidate suitability.
- It may rank only combinations that are currently eligible under server-owned rules.
- It must never create or mutate a trip, assignment, loading authorization, dispatch clearance or financial record.
- It must never override statutory, maintenance, active-assignment or shipper blockers.
- Operators remain responsible for selecting and dispatching a vehicle through the existing guarded workflow.
- Missing or stale evidence must reduce confidence/data quality; it must not be replaced by invented precision.

## 3. Evidence hierarchy

### 3.1 Vehicle position

Use the latest `VehicleLiveState` for tractor position when coordinates exist. Record source, trust and freshness. A stale live state remains visible as evidence but must be labelled stale and receive a quality penalty.

If live telematics is absent, fall back to the latest authoritative operational location only when a reasonable location can be derived. Static city assumptions are the last fallback and must be identified as such.

### 3.2 Eligibility and availability

Candidate discovery must reuse the same server-owned constraints used by dispatch/assignment recommendation flows:

- driver active and verified;
- licence validity/class;
- tractor active, insured and roadworthy;
- maintenance safety blocks;
- trailer availability/type where required;
- shipper/site documents and restrictions where context is supplied;
- existing active driver/tractor/trailer assignments;
- active trailer coupling conflicts.

A candidate with a blocker is excluded from recommendations rather than shown with a high route score.

### 3.3 Route geometry and distance

The existing Ghana inter-city matrix may remain as a deterministic offline fallback. It must be represented as `static_fallback`, not as live road-network truth.

Where a persisted `PlannedRoute` or other authoritative route evidence exists, Route Intelligence may use it. The feature must preserve multi-stop planning and explicitly report missing legs rather than silently fabricating them.

No external routing or live-traffic provider is required for Phase 7. The domain contract must leave room for a future provider without coupling business logic to a vendor.

### 3.4 Fuel evidence

Fuel estimation must not use the prototype formula `32 L/100km + 2 L/100km per tonne` as authoritative truth.

Use this hierarchy:

1. truck-specific recent completed/reconciled trip efficiency when enough valid distance/fuel samples exist;
2. fleet-level recent valid efficiency when truck evidence is insufficient;
3. a clearly identified conservative configured/default fallback.

Cargo weight may adjust the estimate only through a bounded, documented factor. Unknown weight must not create an arbitrary penalty.

Fuel price must come from the request or configured settings. A numeric default may be used only as an explicit fallback with provenance; it must not be labelled as the current market price.

## 4. Route advisory domain contract

Create a pure domain module under `src/lib/domain/route-intelligence/` with no Prisma dependency.

It accepts normalized route legs, fuel evidence and normalized candidate snapshots and produces:

- route summary and legs;
- route source/provenance;
- distance and ETA estimate;
- fuel litres/cost estimate with evidence source;
- candidate recommendations ranked by eligible deadhead/quality evidence;
- confidence and data-quality score/grade;
- evidence/fallback assumptions;
- exclusion counts/reasons where safe to expose.

Scoring must be deterministic and versioned. Equal inputs must produce equal ranking.

## 5. Repository / data-loading contract

Prisma access belongs in a repository/loader module, not in the pure scoring module.

The loader must batch-fetch required data. It must not issue per-truck N+1 queries for latest trip/fuel evidence.

The response must not expose driver phone numbers, licence numbers, Ghana Card numbers or unrelated financial information.

Live-state freshness is measured from server receipt time, not untrusted device time.

## 6. API contract

Harden `GET /api/routes/optimize` rather than creating a competing endpoint.

### Inputs

- `from` and `to` are required known route nodes.
- `stops` remains optional, maximum 5.
- `weight` is optional tonnes and must be finite, non-negative and bounded.
- `fuelPrice` is optional GHS/litre and must be finite, positive and bounded.
- future load-order/trip context may be accepted only if authorization and scoping are enforced server-side.

Malformed numeric values such as `NaN`, `Infinity`, negative values or unreasonable upper bounds return `400`.

### Authorization

The route planner requires the existing trip-view permission for route estimates. Fleet-wide vehicle recommendations require operational assignment authority such as `trips.create`; a Driver must never receive fleet-wide candidate data. Existing demo isolation remains enforced by the central proxy.

### Response

Preserve backwards-compatible route fields used by the current UI where practical, while adding:

- `advisoryVersion`;
- `generatedAt`;
- `route.source`;
- `route.dataQuality`;
- `fuelEstimate.source` and assumptions;
- recommendation confidence, location source/freshness and reasons;
- advisory/fallback notices.

## 7. UI requirements

Keep the existing Route Optimizer navigation and overall workflow, but make evidence quality visible.

- Show whether distance/ETA is static fallback or stronger evidence.
- Show fuel estimate source rather than a misleading “recommended current price”.
- Show telematics freshness for recommended vehicles.
- Do not expose fleet recommendations to users without assignment permission.
- Explain limited-confidence states in plain language.
- Preserve responsive/mobile behavior and multi-stop planning.

## 8. Data quality and confidence

The advisory quality score is deterministic in the 0..1 range.

Quality decreases for:

- static route fallback;
- stale/missing telematics;
- fleet/default fuel-efficiency fallback;
- missing optional route/vehicle history.

Hard eligibility blockers do not merely reduce quality; they exclude the candidate.

Recommended grades:

- `trusted`: >= 0.85
- `usable`: >= 0.65 and < 0.85
- `limited`: < 0.65

Confidence must never exceed data quality.

## 9. Required regression coverage

Tests must prove at minimum:

1. invalid numeric input is rejected rather than becoming `NaN` calculations;
2. an active but ineligible/maintenance-blocked/busy vehicle is not recommended;
3. fresh live telematics outranks stale/unknown location evidence when otherwise comparable;
4. stale telematics is labelled and penalized rather than presented as current;
5. missing truck fuel history falls back to fleet/default evidence with lower quality;
6. multi-stop missing legs fail explicitly;
7. driver-scoped access cannot return fleet-wide recommendations;
8. candidate loading is batched and does not regress into N+1 query behavior;
9. advisory generation performs no trip/assignment mutation;
10. the current Route Optimizer UI consumes the new provenance fields without losing existing planning behavior.

## 10. Non-goals

- Autonomous rerouting or dispatch.
- Live traffic claims without a contracted provider.
- Hard-coding factory brands into route logic.
- Replacing Phase 3 route-deviation/geofence processing.
- Replacing Phase 6 load-order assignment recommendations.
- Training/promoting a learned routing model in this phase.

## 11. Exit gate

Phase 7 is complete when the Route Optimizer can produce a deterministic, evidence-labelled Ghana haulage route advisory; fleet candidates are limited to currently eligible resources using live telematics where available; fuel/ETA estimates disclose their evidence quality; unauthorized users cannot see fleet recommendations; focused and full CI gates pass; and no route-advisory action can mutate dispatch state.
