# Phase 10: API Rate Limiting & Security Hardening

## Task
Create an in-memory rate limiting utility and apply it to authentication-critical API routes, plus build a security helper utility.

## Files Created

### 1. `src/lib/rate-limit.ts` — In-Memory Rate Limiter Utility
- **`RateLimitEntry` / `RateLimitConfig` / `RateLimitResult`** interfaces exported with full JSDoc
- **`rateLimit(identifier, config)`** — Core function using `Map<string, RateLimitEntry>` storage
  - Key format: `{ip}:{endpoint}` (caller-controlled via identifier)
  - Fixed-window algorithm: increments counter per window, blocks on overflow
  - Automatic window expiry and block expiry handling
- **`createRateLimitMiddleware(config, prefix)`** — Factory that returns `(request) => RateLimitResult` for easy route integration
- **`getClientIp(request)`** — Extracts client IP from `x-forwarded-for` → `x-real-ip` → `'unknown'`
- **`RATE_LIMITS`** — Pre-defined configs:
  - `login`: 5 req / 15 min, 30 min block
  - `api`: 100 req / min
  - `sensitive`: 20 req / min, 15 min block
  - `notification`: 30 req / min
- **Automatic cleanup**: `setInterval` every 5 minutes removes expired entries; timer uses `.unref()` to not block process exit
- Singleton import pattern — all routes share the same `Map` store

### 2. `src/lib/security.ts` — Security Helper Functions
- **`sanitizeInput(input)`** — Strips HTML tags, normalises whitespace, entity-encodes `<> & " '`
- **`isValidJwtFormat(token)`** — Validates 3-segment Base64url structure (format-only, no signature verification)
- **`isSuspiciousRequest(request)`** — Heuristic bot detection: missing User-Agent, known bot patterns, missing Accept header
- **`generateSecureToken(byteLength?)`** — Cryptographically secure hex token via `crypto.randomBytes` (default 32 bytes → 64 hex chars)
- **`maskSensitiveData(data, visibleChars?)`** — Masks leading characters with `*`, e.g. `maskSensitiveData('0241234567')` → `****4567`

## Files Modified

### 3. `src/app/api/auth/login/route.ts` — Replaced custom rate limiter with shared utility
- Removed inline `loginAttempts` Map, `checkRateLimit()`, `clearFailedAttempts()`, `pruneRateLimiter()`, and all related constants
- Added import of `rateLimit`, `RATE_LIMITS`, `getClientIp` from `@/lib/rate-limit`
- Rate check runs before credential validation using `RATE_LIMITS.login` (5/15min, block 30min)
- Returns 429 with `Retry-After` header, human-readable error message with minutes, and `retryAfter` in JSON body
- All other login logic (password comparison, bcrypt migration, JWT generation, audit logging) preserved unchanged

### 4. `src/app/api/auth/change-password/route.ts` — Added rate limiting
- Added import of `rateLimit`, `RATE_LIMITS`, `getClientIp` from `@/lib/rate-limit`
- Rate check runs BEFORE `requireAuth()` using `RATE_LIMITS.sensitive` (20/min, block 15min)
- Returns 429 with `Retry-After` header and descriptive error message
- All existing password change logic preserved unchanged

### 5. `src/app/api/notifications/bulk-delete/route.ts` — Added rate limiting
- Added import of `rateLimit`, `RATE_LIMITS`, `getClientIp` from `@/lib/rate-limit`
- Rate check runs before body parsing using `RATE_LIMITS.notification` (30/min)
- Returns 429 with `Retry-After` header and descriptive error message
- Updated JSDoc to document rate limiting policy
- All existing deletion mode logic (ids, deleteAll, deleteReadOnly) preserved unchanged

## Verification
- `bun run lint` — zero errors
- Dev server healthy on port 3000 (HTTP 200)
