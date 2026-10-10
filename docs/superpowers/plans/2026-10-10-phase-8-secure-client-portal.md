# Phase 8 Secure Client Portal Implementation Plan

**Goal:** Replace the incomplete raw-ID portal prototype with signed expiring share links, tenant-bound public APIs and a real `/portal` customer page.

**Architecture:** Keep share-token issuance behind normal RBAC. Make only dedicated GET portal endpoints public at the proxy, then perform token verification and client scoping inside those handlers. Reuse a shared data loader to batch portal evidence and minimize public payloads. Internal preview must consume the same public contract as customers.

## Task 1 — Portal token domain
- Create `src/lib/portal/share-token.ts`.
- Create focused tests for sign/verify, expiry, tamper, audience/purpose and TTL bounds.
- Use portal-specific issuer/audience/purpose and `NEXTAUTH_SECRET` key material.

## Task 2 — Secure share issuance
- Create `POST /api/portal/share/client/[clientId]`.
- Require `trips.view`.
- Verify active client and 1–30 day TTL.
- Return `{ token, expiresAt, path: '/portal#access=...' }`.

## Task 3 — Privacy-minimized batched portal loader
- Create `src/lib/domain/client-portal/repository.ts`.
- Batch active shipment location evidence.
- Bound completed trips/invoices/history.
- Omit driver phone, employee ID and internal notes.
- Attach location freshness/source.

## Task 4 — Dedicated public API boundary
- Create `GET /api/portal/public/client`.
- Create `GET /api/portal/public/shipment/[tripId]`.
- Verify `X-Portal-Token` before loading data.
- Bind shipment query to token client.
- Retire legacy raw-ID handlers from public use.
- Update proxy so only secure portal GET routes bypass session auth.

## Task 5 — Real public `/portal` experience
- Create `/portal/page.tsx` plus a customer portal component.
- Read token only from fragment; do not persist it to browser storage.
- Render account summary, active shipments, recent deliveries and invoices.
- Fetch shipment detail with same token.
- Clearly show invalid/expired link and stale-location states.

## Task 6 — Staff preview/share flow
- Update `ClientPortalView` to issue a token through authenticated API.
- View Portal and shipment tracking use the secure public endpoints.
- Copy Link generates `/portal#access=...`.
- Remove direct `/?clientId=...` links and public raw-ID fetches.

## Task 7 — Release gate
- Exact-head GitHub Actions must pass dependency install, secret scan, full tests, lint and production build.
- Review changed routes for raw-ID authorization bypass, token leakage, PII, N+1 queries and mutation paths.
- Merge only the verified head into `main`.
