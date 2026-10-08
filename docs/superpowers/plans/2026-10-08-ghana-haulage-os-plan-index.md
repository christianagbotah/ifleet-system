# iFleetPro Ghana Haulage OS — Execution Plan Index

**Spec:** `docs/superpowers/specs/2026-10-07-ghana-haulage-os-design.md`

## Execution order

1. `2026-10-08-phase-0-security-platform-hardening.md`
2. `2026-10-08-phase-1-haulage-domain-foundation.md`
3. `2026-10-08-phase-2-factory-loading-compliance.md`
4. `2026-10-08-phase-3-telematics-control-tower.md`
5. `2026-10-08-phase-4-delivery-financial-closure.md`
6. `2026-10-08-cross-cutting-integrations-reporting-ux.md`
7. `2026-10-08-phase-5-video-telematics.md`
8. `2026-10-08-phase-6-ai-operations.md`

Each plan has an independent exit gate. Do not start a dependent plan until its upstream interfaces and exit gate are verified.

## Program invariants

- No destructive database reset.
- Existing production trip/fleet records remain readable during migration.
- Security remediation is first and blocks unsafe production expansion.
- Tractor and trailer are separate assets; rigid trucks remain supported.
- Shipper/factory differences are configuration, not brand-coded conditions.
- All state transitions, clearance decisions, settlement calculations and AI recommendations go through domain services with tests.
- Telematics is hardware/vendor-neutral and persists normalized events before treating them as operational truth.
- Phone GPS remains fallback; satellite imagery is only a map basemap option.
- Video is on-demand/event-driven by default.
- Finance visibility is permission controlled.
- AI remains advisory and explainable in this program.

## Spec coverage self-review

The implementation set covers: security/credential isolation; regression/CI baseline; organizations/transporters/owners; contracts/rates; tractor/trailer/coupling; shipper profiles; load orders and CSV/Excel/API/webhook ingestion; guarded trip lifecycle; assignment eligibility; gate/queue/loading; versioned compliance; weighing/axle clearance; e-waybills; device registry/provider adapters; persistent tracking; geofences/routes/Control Tower; ePOD/exceptions; reconciliation; driver/haulier settlement; profitability; offline driver workflow; operational event ledger; Operations Dashboard/Trip Workspace; required report families; video telematics; deterministic AI and governed future ML.

No implementation-critical spec section is intentionally omitted. Proprietary shipper APIs remain connector work triggered only when credentials/contracts and API documentation exist, as required by the spec's non-goals.
