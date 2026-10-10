# iFleetPro Phase 10 — Rate Limiting & Authentication Abuse Hardening

**Date:** 2026-10-10  
**Base:** Phase 8 secure client portal (`main` at `02a1906`)

## Purpose

Harden the existing Phase 10 prototype without duplicating its utilities. The starting implementation had two independent in-memory limiter implementations, counted successful login traffic against the same login bucket as abuse, and did not protect one account from failed credentials distributed across multiple source IPs.

## Security model

Rate limiting is defense-in-depth, not authentication. It must not reveal whether an account exists.

### Login

Use three independent controls:

1. **Request throttle** — coarse per-client-IP limit that counts all login POSTs and protects application/database/password-comparison resources. It must be high enough that normal users behind a shared office/NAT are not locked out by ordinary successful usage.
2. **Source + account credential-failure limiter** — only failed authentication attempts consume this bucket. The key combines normalized account identity and client IP so one source cannot repeatedly brute-force one account. Successful authentication resets this bucket.
3. **Account-wide credential-failure limiter** — only failed authentication attempts consume this bucket. The key uses normalized account identity without client IP so rotating/distributed sources cannot bypass the source/account limiter. Its threshold is deliberately higher than the source/account threshold to reduce trivial lockout denial-of-service. Successful authentication resets this bucket too.

Policies:

- `loginRequest`: 30 requests / 15 minutes per source IP, 15-minute block;
- `loginFailure`: 5 failed credentials / 15 minutes per source IP + normalized account, 30-minute block;
- `loginAccountFailure`: 10 failed credentials / 15 minutes per normalized account across sources, 30-minute block.

The failed-credential policies are stricter than request flooding and replace the misleading old behavior where documented login protection did not match the live threshold.

### Threshold semantics

Consuming the final allowed attempt arms the block but still returns that attempt as allowed with zero remaining. A subsequent request sees the armed block through the non-mutating status check and is rejected before route-specific expensive work.

For login this means:

- failures 1–5 from one source/account return the same generic invalid-credential response;
- after failure 5 the source/account bucket is armed;
- request 6 is rejected before user lookup or password comparison;
- the same model applies to the account-wide threshold of 10 failures across sources.

### Other sensitive routes

Password-reset/change and bulk destructive operations continue to use explicit endpoint-scoped policies. 429 responses return `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` where practical.

### Global API protection

The application proxy reuses the shared limiter utility rather than maintaining a second algorithm. Global API throttling remains a broad per-client-IP safety net and does not replace route-specific sensitive policies.

## Client identity

The application may receive `x-real-ip`/`x-forwarded-for` from the deployment proxy. Prefer `x-real-ip` when present, otherwise use the first non-empty forwarded value and finally `unknown`. Deployment infrastructure must overwrite/sanitize these headers; application code cannot cryptographically prove a caller-supplied forwarding header.

## Storage and scaling

This phase keeps the existing in-memory store because iFleetPro currently has no shared Redis rate-limit dependency. The store is shared through `globalThis` within one runtime, cleaned opportunistically, and capped at 50,000 entries.

Counters are therefore per runtime/process. Before horizontally scaled production deployment, supplement or replace the process-local store with a shared Redis/edge/WAF limiter. Otherwise an attacker can distribute traffic across application instances even though per-instance route policies are correct.

The utility contract keeps route policy separate from storage so a shared-store implementation can be introduced later without rewriting callers.

## Lockout trade-off

Account-wide throttling can itself be abused to temporarily deny a known account. Phase 10 mitigates this by making the account-wide threshold (10) higher than the source/account threshold (5) rather than using the same aggressive threshold. Future high-assurance production hardening should prefer adaptive challenge/risk scoring, MFA and shared edge enforcement instead of lowering the account-wide threshold further.

## Required behavior

- deterministic fixed-window limits with explicit block duration;
- non-mutating status check;
- explicit reset API;
- bounded store with opportunistic cleanup;
- final allowed attempt arms the next-request block;
- successful login does not accumulate failed-attempt debt;
- each credential failure increments both source/account and account-wide buckets;
- both failure buckets are checked before account lookup/password comparison;
- successful authentication resets both failure buckets;
- user-not-found, missing-password and wrong-password outcomes use the same generic credential response;
- proxy imports the shared limiter rather than duplicating store/algorithm;
- public portal and API routes remain protected by global proxy throttling;
- tests cover threshold arming, reset, expiry, successful-login reset, source/account blocking, account-wide policy, client-IP precedence and proxy consolidation.

## Exit gate

Phase 10 is complete only when the exact PR head passes secret scan, full tests, lint and production build, the branch receives a whole-diff review with no unresolved Critical/Important findings, and the login path demonstrates independent request/source/account controls without weakening authentication response privacy.
