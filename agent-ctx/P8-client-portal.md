# Phase 8: Secure Client Portal / Shipment Tracking

## Current architecture

Phase 8 no longer treats raw `clientId` or `tripId` values as public credentials.

The authoritative design is:

- `docs/superpowers/specs/2026-10-10-phase-8-secure-client-portal-design.md`
- `docs/superpowers/plans/2026-10-10-phase-8-secure-client-portal.md`

## Secure share flow

1. Authenticated staff selects an active client in the internal Client Portal view.
2. Staff requests a signed, expiring link via:
   - `POST /api/portal/share/client/[clientId]`
   - requires existing `trips.view` permission.
3. The server returns a bounded portal token and `/portal#access=<token>` path.
4. The client opens `/portal`; the browser reads the token from the URL fragment, removes the fragment from browser history, and keeps the token only in memory.
5. Public customer data is fetched through token-verifying routes:
   - `GET /api/portal/public/client`
   - `GET /api/portal/public/shipment/[tripId]`
   - token supplied in `X-Portal-Token`.
6. Shipment lookup is bound to the client identity encoded in the verified token.

## Retired insecure routes

The legacy raw-ID routes are retired and must not be restored as public data endpoints:

- `/api/portal/client/[clientId]`
- `/api/portal/shipment/[tripId]`

They return `410 Gone` and point callers to the secure public contract.

## Public privacy boundary

Customer share links may expose customer-useful shipment information, but must not expose driver phone numbers, employee IDs, licence/Ghana Card data, internal trip notes, internal event notes, or unrelated fleet/financial records.

The public portal shows location freshness (`fresh`, `stale`, `unknown`) and source rather than claiming every coordinate is live.

## Performance boundary

Client dashboard active-shipment locations are loaded in a batch rather than a per-trip N+1 loop. Recent delivery and invoice result sets are bounded.

## UI

- Internal `ClientPortalView`: staff-only client selection, secure preview, share-link generation.
- Public `/portal`: customer-facing mobile-responsive portal using the same public token-bound API contract as staff preview.
- Public invoice metadata is visible, but public PDF download remains disabled until a separate token-bound document endpoint is implemented.

## Release rule

Do not merge Phase 8 unless the exact branch head passes the repository CI gates: secret scan, full tests, lint and production build.
