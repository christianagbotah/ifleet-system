# iFleetPro Phase 8 — Secure Client Portal & Shipment Tracking

**Date:** 2026-10-10  
**Status:** Approved by standing project ownership mandate  
**Base:** Phase 7 route intelligence (`main` at `2cb1c43`)

## 1. Purpose

Complete the existing Phase 8 Client Portal as a genuinely shareable, mobile-friendly customer experience without exposing fleet/customer data through predictable database IDs.

The prototype currently declares `/api/portal/client/[clientId]` and `/api/portal/shipment/[tripId]` public while accepting raw IDs, and its Copy Link action produces `/?clientId=...` even though no public route consumes that parameter. The application proxy also does not currently exempt those routes, so the advertised public flow is incomplete while the route handlers themselves still encode an unsafe public-ID design.

Phase 8 replaces that design with an explicit portal-access boundary.

## 2. Security boundary

A share link must never grant access solely because a caller knows a `clientId` or `tripId`.

Public portal access requires a signed, expiring client-portal token issued by an authenticated iFleetPro operator. The token is:

- cryptographically signed with the server secret and a portal-specific issuer/audience/purpose;
- scoped to exactly one active client;
- short-lived by default and capped to a bounded maximum lifetime;
- supplied to APIs in an `X-Portal-Token` request header, not as a database ID credential;
- placed in the browser URL fragment (`/portal#access=...`) so it is not sent in the initial HTTP request, server logs, or referrer URL;
- rejected when malformed, expired, wrong-purpose, wrong-audience, or bound to another client.

The public portal APIs never trust client IDs supplied by the browser. Client identity comes from verified token claims.

## 3. Share-link issuance

Create an authenticated endpoint:

`POST /api/portal/share/client/[clientId]`

Requirements:

- requires `trips.view` permission under existing RBAC;
- client must exist and be active;
- optional requested lifetime is finite, integer and bounded (1–30 days);
- response includes token, expiry and relative public link path;
- issuance never returns unrelated client data;
- demo isolation remains enforced by the central proxy;
- future per-link revocation can replace stateless tokens without changing the public API contract.

## 4. Public APIs

Use dedicated public GET routes:

- `GET /api/portal/public/client`
- `GET /api/portal/public/shipment/[tripId]`

Only these GET routes are exempted from normal session auth by the proxy. Every handler independently verifies `X-Portal-Token` before querying customer data.

Shipment access is additionally bound by `trip.clientId === token.clientId`. A valid token for Client A must receive `404`/`403` for Client B's trip even if the trip ID is known.

Legacy raw-ID public handlers must no longer serve portal data. They should return a safe migration response or require normal staff authentication; no predictable-ID public path remains.

## 5. Data minimization

The public portal may show customer-useful operational information:

- shipment/trip number and lifecycle status;
- loading/destination, cargo quantity/unit;
- truck plate/make/model;
- driver display name;
- delivery-stop progress;
- latest shipment GPS location and freshness;
- customer-facing timeline events;
- client invoices/account summary.

Do **not** expose via public share links:

- driver phone number;
- driver employee ID, licence data, Ghana Card or other personal identifiers;
- internal trip notes;
- internal event notes that may contain operational/private detail;
- unrelated fleet/financial records.

## 6. Live-location quality

Latest location is customer-visible but must not be labelled “live” solely because a coordinate exists.

Return:

- `receivedAt`/timestamp;
- deterministic freshness: `fresh`, `stale`, `unknown`;
- source where safe;
- speed only when present.

Use server-received/live-state evidence where available. Historical `TruckLocation` may remain fallback but must be freshness-labelled.

## 7. Query efficiency

The client dashboard must avoid N+1 location queries. Batch active-trip location evidence, then map it to shipments. Bound recent delivery/invoice/history result sizes.

## 8. Public page

Create a real `/portal` page.

On load it:

1. reads `#access=<token>` from the URL fragment;
2. removes the fragment from browser history after capturing it where practical;
3. requests the secure public client endpoint with `X-Portal-Token`;
4. renders responsive shipment/account views;
5. sends the same token to shipment-detail requests;
6. never stores the token in localStorage;
7. shows clear invalid/expired-link states without leaking internal IDs.

## 9. Staff portal preview

The existing internal `ClientPortalView` remains the operator control surface.

- client selection remains authenticated;
- View Portal obtains a bounded share token and previews through the same public API contract clients use;
- Copy Link requests a fresh token and copies `/portal#access=...`;
- tracking detail uses that token;
- no direct unauthenticated `/api/portal/client/[clientId]` fetch remains.

## 10. Invoice documents

The existing invoice PDF feature must not be exposed by simply linking an authenticated staff endpoint from a public page. Phase 8 may initially show invoice/account metadata while public PDF download remains disabled until a token-bound document endpoint is implemented and tested.

## 11. Required regression coverage

Tests must prove:

1. tokens round-trip and expire;
2. wrong audience/purpose/tampered token is rejected;
3. token lifetime >30 days is rejected/clamped at issuance;
4. share issuance requires staff permission and active client;
5. public client API rejects missing/invalid token before DB data is returned;
6. public shipment API rejects cross-client trip access;
7. public payload omits driver phone/employee ID/internal notes;
8. dashboard live-location loading is batched, not per-trip N+1;
9. proxy exposes only secure public portal GET routes, not share issuance or legacy raw-ID routes;
10. staff Copy Link produces `/portal#access=...`, not `/?clientId=...`;
11. public page never writes portal token to localStorage/sessionStorage;
12. full tests, lint and production build pass before merge.

## 12. Exit gate

Phase 8 is complete when operators can generate an expiring share link; clients can open a real `/portal` page and see only their own shipments/account information; shipment detail is token-bound; customer payloads are privacy-minimized; location freshness is explicit; raw IDs are not public credentials; the portal APIs avoid N+1 location access; and exact-head CI passes secret scan, full tests, lint and production build.
