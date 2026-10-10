# iFleetPro Phase 10 — Rate Limiting & Authentication Abuse Hardening

**Date:** 2026-10-10  
**Base:** Phase 8 secure client portal (`main` at `02a1906`)

## Purpose

Harden the existing Phase 10 prototype without duplicating its utilities. The current implementation has two independent in-memory limiter implementations (shared utility and proxy), counts successful login requests against the same login bucket, and does not separate request flooding from failed-credential abuse.

## Security model

Rate limiting is defense-in-depth, not authentication. It must not reveal whether an account exists.

### Login

Use two independent controls:

1. **Request throttle** — coarse per-client-IP limit that counts all login POSTs and protects CPU/database resources. It must be high enough that successful users behind a shared office/NAT are not locked out by normal usage.
2. **Credential-failure limiter** — only failed authentication attempts consume this bucket. Use a normalized account identifier plus client IP so a single source cannot brute-force one account. Successful authentication resets the failure bucket.

The failed-credential policy is stricter than request flooding and replaces the misleading old `RATE_LIMITS.login` preset whose documentation said 5 attempts while code allowed 20 total login requests.

### Other sensitive routes

Password-reset/change and bulk destructive operations continue to use explicit endpoint-scoped policies. All 429 responses return `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` where practical.

### Global API protection

The application proxy should reuse the shared limiter utility rather than maintaining a second algorithm. Global API throttling remains a broad per-client-IP safety net and does not replace route-specific sensitive policies.

## Client identity

The application may receive `x-real-ip`/`x-forwarded-for` from the deployment proxy. Prefer `x-real-ip` when present, otherwise use the first non-empty forwarded value and finally `unknown`. Deployment infrastructure must overwrite/sanitize these headers; application code cannot cryptographically prove a caller-supplied forwarding header.

## Storage and scaling

This phase keeps the existing in-memory store because iFleetPro currently has no shared Redis rate-limit dependency. The store is bounded and cleaned opportunistically/timer-based. Counters are therefore per runtime/process and are not a substitute for edge/WAF or shared Redis enforcement when horizontally scaled.

The utility contract must make future shared storage replacement possible without changing route policies.

## Required behavior

- deterministic fixed-window limits with block duration;
- non-mutating status check;
- explicit reset API;
- bounded store with cleanup;
- login success does not accumulate failed-attempt debt;
- failed credentials increment failure bucket;
- blocked failure bucket is checked before password comparison;
- user-not-found and wrong-password responses remain identical;
- proxy imports shared limiter rather than duplicating store/algorithm;
- public portal and API routes remain protected by global proxy throttling;
- tests cover threshold, reset, expiry, login success reset, failed login blocking, and proxy consolidation.

## Exit gate

Phase 10 is complete only when the exact PR head passes secret scan, full tests, lint, and production build, and the login path demonstrates separate request/failure controls without changing authentication response privacy.
