# Phase 10: API Rate Limiting & Authentication Abuse Hardening

## Current architecture

Phase 10 now uses one shared bounded in-memory limiter implementation for both global API throttling and route-specific sensitive policies.

The authoritative design is:

- `docs/superpowers/specs/2026-10-10-phase-10-rate-limit-hardening-design.md`

## Shared limiter — `src/lib/rate-limit.ts`

The shared module provides:

- `rateLimit(identifier, config)` — consume one fixed-window attempt;
- `getRateLimitStatus(identifier, config)` — inspect a bucket without consuming an attempt;
- `resetRateLimit(identifier)` — clear a bucket explicitly;
- `rateLimitHeaders(result, config)` — consistent `X-RateLimit-*` / `Retry-After` headers;
- `createRateLimitMiddleware(config, prefix)` — convenience route wrapper;
- `getClientIp(request)` — prefers `x-real-ip`, then the first `x-forwarded-for` value, then `unknown`.

Deployment infrastructure must overwrite/sanitize forwarding headers. Application code cannot prove a caller-supplied forwarding header is trustworthy on its own.

The store is kept on `globalThis` so hot reloads/imports in one runtime reuse the same Map. It is cleaned opportunistically and capped at 50,000 entries; if the process is horizontally scaled, counters remain per runtime. A shared Redis/edge/WAF limiter should replace or supplement this store before multi-instance production scaling.

## Policies

### Login request throttle

`RATE_LIMITS.loginRequest`

- 30 POST requests per client IP / 15 minutes;
- 15-minute block on overflow;
- counts all login requests;
- exists to protect application/database/password-comparison resources;
- deliberately separate from failed-credential debt so successful users behind a shared NAT do not accumulate brute-force lockout state.

### Failed credential throttle

`RATE_LIMITS.loginFailure`

- 5 failed credentials per normalized account + client IP / 15 minutes;
- 30-minute block on overflow;
- checked without consuming an attempt before account lookup/password comparison;
- only user-not-found, no-password, and wrong-password outcomes consume this bucket;
- successful authentication calls `resetRateLimit(failureKey)`;
- invalid credentials return the same generic `Invalid email or password` response.

### Other presets

- `RATE_LIMITS.api`: 100 requests/minute, 60-second block — global proxy safety net.
- `RATE_LIMITS.sensitive`: 20 requests/minute, 15-minute block — existing sensitive endpoints.
- `RATE_LIMITS.notification`: 30 requests/minute — existing notification operations.
- `RATE_LIMITS.login`: legacy auth-sensitive preset retained for current forgot-password callers until those routes move to their own named policy.

## Login route — `src/app/api/auth/login/route.ts`

The login flow now:

1. validates the body;
2. normalizes email to lowercase;
3. applies `loginRequest` by client IP;
4. checks `loginFailure` status for the normalized email + IP without consuming it;
5. loads the user;
6. funnels user-not-found, missing-password and wrong-password through one generic credential-failure function;
7. records a failed credential attempt only on those failures;
8. clears failed-attempt debt after a correct password;
9. continues normal JWT issuance, last-login update and audit logging.

429 responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

## Global proxy — `src/proxy.ts`

The proxy no longer contains a second `Map`/algorithm. It imports the shared limiter and applies `RATE_LIMITS.api` using a `global:<clientIp>` key.

Public GET access preserves the established `PUBLIC_GET_ONLY_ROUTES` contract while distinguishing exact routes from prefix routes, preventing accidental public exposure from loose prefix matching.

## Security helpers

`src/lib/security.ts` continues to provide input sanitization, JWT-format checks, suspicious-request heuristics, secure random token generation and sensitive-data masking. These helpers do not replace authentication, authorization or signature verification.

## Regression coverage

Phase 10 includes tests proving:

- failed credential policy is 5 attempts / 15 minutes with a 30-minute block;
- non-consuming status inspection and explicit reset work;
- block expiry restores access;
- `x-real-ip` takes deployment-proxy precedence;
- login uses separate request/failure buckets;
- five failed credentials return generic 401s and the next attempt is blocked;
- successful authentication resets accumulated failure debt;
- mixed-case email is normalized before lookup;
- global proxy reuses the shared limiter rather than duplicating it;
- pre-existing public electronic-waybill and client-portal route contracts remain intact.

## Release rule

Do not merge Phase 10 unless the exact PR head passes the repository CI gates: secret scan, complete test suite, lint and production build.
