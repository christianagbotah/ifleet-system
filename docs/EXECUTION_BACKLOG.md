# Fleetivo (iFleetPro) — Execution backlog

Product of Lightworld Technologies Limited. Baseline: 2026-11-26 UTC.
Public development roadmap: do not include credentials, customer records, private infrastructure details, unreviewed local history or sensitive security findings.

## Execution contract

P0 = release/security/data integrity; P1 = core workflows; P2 = extended capabilities; P3 = optional scope. Unchecked means not yet verified, not necessarily absent. Existing business specifications govern scope. Native clients are conditional on approved requirements.
For each task: audit existing code and spec, implement a complete vertical slice, review database migrations/constraints, API authorization and validation, responsive UI, applicable mobile/desktop behavior, automated tests (including failure cases), documentation, CI and verified release. Record commit, PR, test run, artifact checksum, deployment identity and sanitized acceptance evidence. Never infer completion from code presence or HTTP 200. Continue immediately to the next independent actionable task during active execution. No hourly scheduling substitute.
Use GitHub-first review, CI, builds, packaging and versioned releases. Deploy only verified runtime artifacts; retain rollback and preserve state. Do not build on production. No destructive cleanup without proof of recoverability. Keep sensitive audit evidence in an approved nonpublic location; never attach raw production logs or records to this repository.

## Persistent execution checkpoint

- 2026-11-26: repository identity, public visibility and write permission confirmed. Owner authorized retaining public visibility; no paid plan required by this workflow.
- Baseline application scope and source plans identified; detailed operational evidence is intentionally excluded from the public roadmap.
- Next actionable: A02/A04 review existing development changes for safe preservation; A05 reconcile reviewed changes through PRs. A07 completes only once this document is merged. A08/A09 can proceed independently on a reviewed branch; no production promotion before reconciliation and release gates.
- No feature, artifact or production deployment certified by this checkpoint.

## A — P0 Repository recovery, release engineering and provenance

- [x] A01 Confirm repository identity and default branch.
- [ ] A02 Inventory development copies and unique tracked/staged/untracked changes; identify active runtime and recoverable rollback without exposing infrastructure details.
- [x] A03 Confirm public-repository policy and write permission; sensitive material remains nonpublic.
- [ ] A04 Screen candidate source and history for secrets, personal data and generated records; preserve safe work; keep restricted material in an approved secure store. Never publish raw environment/config files or production data.
- [ ] A05 Reconcile reviewed source changes against main through PRs; preserve migrations and test evidence; no force pushes or destructive resets.
- [ ] A06 Review outstanding deployment-related PRs; resolve conflicts, test locking, permissions, restart and rollback.
- [ ] A07 Merge this execution backlog and maintain its checkpoint with each completed task.
- [ ] A08 Audit existing GitHub Actions, lockfiles and runtime versions; enforce clean install, lint, typecheck, unit/integration tests, disposable database migrations, E2E and production build.
- [ ] A09 Create GitHub release workflow for minimal immutable runtime archive, SHA-256, dependency manifest, SBOM and versioned artifacts; exclude development caches, credentials and local databases.
- [ ] A10 Validate artifact installation and migration compatibility in isolated staging; rehearse rollback and health checks.
- [ ] A11 Implement locked, atomic, checksum-verified deployment; externalize mutable state and config; preserve entry paths and integrations.
- [ ] A12 Verify runtime release identity and rollback availability; remove only confirmed inactive and recoverable copies; document storage impact privately.

## B — P0 Security, identity and data integrity

- [ ] B01 Validate login, password recovery, session expiry/revocation, secure cookies, CSRF, CORS, rate limiting and negative tests.
- [ ] B02 Enforce tenant and role isolation on every API, export, file and live event stream; cover object-level access and privilege escalation tests.
- [ ] B03 Audit Prisma migrations, indexes, constraints, transactions, timezone semantics, backup/restore and isolated demo fixtures.
- [ ] B04 Secure document uploads, content validation, size limits, signed access, retention and path traversal protection.
- [ ] B05 Validate integration signatures, replay prevention, least privilege, secret management and log redaction.
- [ ] B06 Validate resource limits, dependency scanning, monitoring, audit integrity, incident response and concurrency tests.
- [ ] B07 Build isolated test fixtures for roles, smoke checks and demo-to-production separation.

## C — P1 Fleet, drivers and master data

- [ ] C01 Verify organizations, transporters, customers, suppliers, depots, routes, zones, items and imports; duplicate detection and audit history.
- [ ] C02 Verify trucks, trailers, capacity, availability, ownership and coupling/assignment history; concurrent assignment tests.
- [ ] C03 Verify driver profiles, licenses, roster, employment status, assignment history and document expiry rules.
- [ ] C04 Verify maintenance readiness, inspections, defects, servicing and availability gates against approved domain rules.
- [ ] C05 Complete role-specific list/detail views, filters, validation, exports and master-data lifecycle E2E tests.

## D — P1 Orders, dispatch and factory compliance

- [ ] D01 Validate load orders, allocations, capacity, scheduling, cancellations and duplicate protection.
- [ ] D02 Verify dispatch assignment, trip state transitions, overrides, transaction boundaries and concurrency.
- [ ] D03 Verify factory gate, queues, loading, weighing, axle/weight rules and clearance.
- [ ] D04 Verify e-waybills, stops, route amendments, border workflows where applicable and printable verification.
- [ ] D05 Complete operations dashboard and trip workspace; test dispatch through loading, including failed transitions.

## E — P1 GPS, tracking and control tower

- [ ] E01 Validate device registry, provider adapters, ingestion identity, deduplication, timestamp ordering and event quarantine.
- [ ] E02 Verify live location, stale/offline states, phone fallback, reconnect, playback, geofences and deviation alerts.
- [ ] E03 Validate route intelligence, tolls, ETA provenance and fallback; avoid unsupported tracking claims.
- [ ] E04 Validate retention, bounded queries, tenant isolation, indexes and load/recovery tests.
- [ ] E05 Complete responsive control tower, map controls, timestamps, loading/error states and tracking-service health checks.

## F — P1 Driver workflow and delivery closure

- [ ] F01 Validate driver assignments, start/stop/checkpoints, offline retry and idempotency.
- [ ] F02 Verify stops, arrival/departure, exceptions, partial/refused deliveries and secured electronic proof of delivery.
- [ ] F03 Test dispatch-to-delivery closure, correction/reopen rules and duplicate prevention.
- [ ] F04 Test low-bandwidth, airplane mode, device permissions and driver-friendly accessible UI.

## G — P1 Finance, payments and settlement

- [ ] G01 Verify contracts, rate tables, currencies, effective dates, fuel budgets, consumption, expenses and receipts.
- [ ] G02 Verify advances, driver wallets, incentives, payroll, approval limits, segregation and reconciliations.
- [ ] G03 Validate invoicing, payments, settlements, profitability, adjustments, voids and financial closure with exact-decimal transactional posting.
- [ ] G04 Verify payment-provider sandbox signatures, amount/currency/reference matching, retries, pending/failure states and reconciliation.
- [ ] G05 Verify financial reporting totals, permissions, rounding, date filters and exports against source ledger.

## H — P1 Notifications, integrations, reporting and customer portal

- [ ] H01 Validate notification configuration, truthful acceptance/delivery statuses and authenticated event streams.
- [ ] H02 Verify preferences, expiry/exception triggers, scheduler behavior, retries, deduplication and opt-out.
- [ ] H03 Validate integration registry, import/export contracts, webhooks and provider mocks; live credentials only through approved secure channels.
- [ ] H04 Verify operations, fleet, driver, fuel, finance, compliance and safety reports; validate exports and tenant isolation.
- [ ] H05 Verify customer-specific order/trip/ePOD access, exports and support flows; test cross-customer denials.

## I — P1 Driver safety and performance analytics

- [ ] I01 Review safety score dimensions, evidence coverage, historical roster and trip/telemetry provenance against existing specifications.
- [ ] I02 Test as-of cutoffs, late receipts, inactive drivers, future-event exclusions and missing evidence semantics.
- [ ] I03 Validate score components and benchmarks against deterministic fixtures; explain coverage and unavailable trends.
- [ ] I04 Verify dashboard drilldowns, accessibility, reporting parity and role isolation.

## J — P2 Video telematics and AI operations

- [ ] J01 Validate video capabilities, event/on-demand access, signed access, retention, consent and provider failure handling.
- [ ] J02 Verify operational AI recommendations, input provenance, explanations, uncertainty, human review and audit.
- [ ] J03 Validate model evaluation, promotion gates, monitoring, rollback and safe fallback.
- [ ] J04 Validate AI service contracts, resource limits, timeout handling, graceful degradation and artifact health checks.

## K — P2 UI/UX and application surfaces

- [ ] K01 Audit Fleetivo brand, navigation hierarchy, responsive tables, filters, accessibility and coherent loading/empty/error states.
- [ ] K02 Verify driver/customer web apps on low-end Android and iOS, offline behavior, installability and touch controls.
- [ ] K03 Confirm native Android/iOS scope; if applicable, implement secure storage, API parity, offline sync, permissions, signed GitHub builds and device UAT.
- [ ] K04 Confirm desktop scope; if applicable, implement supported OS installers, secure storage, update/rollback, signing and GitHub packaging; otherwise record N/A.
- [ ] K05 Validate design consistency, Ghana timezone/units/currency formatting, charts and role-specific visual regression.

## L — P0/P1 Production certification and handover

- [ ] L01 Map specifications to code, tests, PRs and deployment evidence; explicitly record scope decisions.
- [ ] L02 Complete cross-role E2E, negative security tests, load, accessibility, backup/restore and migration compatibility.
- [ ] L03 Establish health checks, monitoring, alerting, retention, incident runbooks and recovery tests.
- [ ] L04 Publish approved versioned release and checksums; verify artifact identity, migrations, production smoke tests and rollback.
- [ ] L05 Complete operator/driver/customer/admin guides, API documentation, deployment and support runbooks; obtain required UAT.
- [ ] L06 Certify production readiness only when applicable P0/P1 and approved scope gates have verified evidence.

## Source plan cross-reference

Review the existing domain, security, factory loading, telematics, delivery/finance, video, AI, route intelligence, client portal, notification and safety plans before implementing each related task. Expand this roadmap as gaps are found.

## Evidence log

Use: UTC | task | result | commit/PR | CI run and tests | release/checksum | sanitized verification | residual work | next task.

2026-11-26 | A01/A03 | Repository identity, public visibility, write permission confirmed; owner public-policy decision recorded | documentation branch | not yet run | not applicable | repository metadata | A07 merge pending | A02/A04/A05 and A08.
