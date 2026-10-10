# Phase 10: API Rate Limiting & Authentication Abuse Hardening

## Current architecture

Phase 10 uses one shared bounded in-memory limiter implementation for global API throttling and route-specific sensitive policies.

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

The store is kept on `globalThis` so imports/hot reloads in one runtime reuse the same Map. Cleanup is opportunistic and the store is capped at 50,000 entries. Counters remain per runtime/process. Before multi-instance production scaling, add a shared Redis/edge/WAF rate-limit layer so one attacker cannot distribute attempts across application instances.

### Threshold semantics

The final allowed attempt is returned as allowed with `remaining: 0`, but the limiter arms `blockedUntil` at that moment. Therefore the next request is rejected before route-specific expensive work. This is important for password authentication: five failed source/account attempts are allowed to return the generic credential response; request six is blocked before user lookup or bcrypt comparison.

## Login policies

### 1. Login request throttle

`RATE_LIMITS.loginRequest`

- 30 POST requests per client IP / 15 minutes;
- 15-minute block after the 30th request is consumed;
- counts successful and failed login requests;
- protects request parsing, database and password-comparison resources;
- deliberately separate from credential-failure debt so normal successful use behind a shared office/NAT does not consume brute-force debt.

### 2. Source + account credential-failure throttle

`RATE_LIMITS.loginFailure`

- 5 failed credentials per normalized account + client IP / 15 minutes;
- 30-minute block after the fifth failure is consumed;
- checked without consuming an attempt before account lookup/password comparison;
- only user-not-found, missing-password and wrong-password outcomes consume the bucket;
- successful authentication clears this bucket;
- the sixth request from that source/account is rejected before database/password work.

### 3. Account-wide credential-failure throttle

`RATE_LIMITS.loginAccountFailure`

- 10 failed credentials per normalized account across all source IPs / 15 minutes;
- 30-minute block after the tenth failure is consumed;
- blocks rotating-IP/distributed brute-force attempts that would bypass the source/account key;
- checked before account lookup/password comparison;
- every credential failure increments it, and successful authentication clears it.

The account-wide threshold is deliberately higher than the source/account threshold to reduce trivial lockout denial-of-service while still bounding distributed guessing. This remains defense-in-depth; stronger production defenses can add MFA, challenge/risk scoring and edge/shared-store enforcement.

Invalid credentials continue to return the same generic `Invalid email or password` response so the limiter does not introduce account-existence disclosure.

### Other presets

- `RATE_LIMITS.api`: 100 requests/minute, 60-second block — global proxy safety net.
- `RATE_LIMITS.sensitive`: 20 requests/minute, 15-minute block — existing sensitive endpoints.
- `RATE_LIMITS.notification`: 30 requests/minute — existing notification operations.
- `RATE_LIMITS.login`: legacy auth-sensitive preset retained for current forgot-password callers until those routes move to their own named policy.

## Login route — `src/app/api/auth/login/route.ts`

The login flow now:

1. validates the body;
2. normalizes email with `trim().toLowerCase()`;
3. applies `loginRequest` by client IP;
4. checks the source/account `loginFailure` status without consuming it;
5. checks the account-wide `loginAccountFailure` status without consuming it;
6. loads the user only when both failure buckets permit work;
7. funnels user-not-found, missing-password and wrong-password through one generic credential-failure function;
8. records each credential failure in both failure buckets;
9. clears both failure buckets after a correct password;
10. continues normal JWT issuance, last-login update and audit logging.

429 responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

## Global proxy — `src/proxy.ts`

The proxy no longer contains a second Map/algorithm. It imports the shared limiter and applies `RATE_LIMITS.api` using a `global:<clientIp>` key.

Public GET access preserves the established public contracts while distinguishing exact routes from prefix routes, preventing accidental public exposure from loose prefix matching.

## Security helpers

`src/lib/security.ts` continues to provide input sanitization, JWT-format checks, suspicious-request heuristics, secure random token generation and sensitive-data masking. These helpers do not replace authentication, authorization or signature verification.

## Regression coverage

Phase 10 includes tests proving:

- source/account failed-credential policy is 5 attempts / 15 minutes with a 30-minute block;
- account-wide failed-credential policy is 10 attempts / 15 minutes with a 30-minute block;
- the final allowed attempt arms a block so the next request is rejected before expensive work;
- non-consuming status inspection and explicit reset work;
- block expiry restores access;
- `x-real-ip` takes deployment-proxy precedence;
- login uses independent request, source/account failure and account-wide failure buckets;
- five source/account failures return generic 401s and request six is blocked before user lookup/bcrypt;
- successful authentication resets both accumulated failure buckets;
- mixed-case email is normalized before lookup/key construction;
- global proxy reuses the shared limiter rather than duplicating it;
- pre-existing public electronic-waybill and client-portal route contracts remain intact.

## Release rule

Do not merge Phase 10 unless the exact PR head passes the repository CI gates: secret scan, complete test suite, lint and production build.
