# Ghana Haulage OS Phase 0 — Security & Platform Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make iFleetPro safe to extend by removing committed secrets, isolating production database access, adding regression tests/CI, and establishing secure configuration/device-ingestion foundations.

**Architecture:** Keep the current Next.js/Prisma/MariaDB application intact while introducing explicit server configuration modules, test infrastructure, CI, secret scanning and a safe database URL policy. Operational credential rotation is a deployment task paired with source remediation; no database reset is allowed.

**Tech Stack:** Next.js 16, TypeScript 5, Bun/Node, Prisma 7 + MariaDB adapter, Vitest, ESLint, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-07-ghana-haulage-os-design.md`

## Global Constraints

- No destructive database reset.
- Production credentials must never exist in tracked files or client bundles.
- Local development must not use the production database by default.
- Existing production fleet/trip records must remain readable throughout the rollout.
- Ghana haulage domain work is blocked until credential rotation and database-access isolation are complete.
- New security-sensitive behavior must be covered by automated tests.

## Review Focus

- Missing/blank `DATABASE_URL` must fail fast with a clear server-only configuration error.
- Development configured with the known production host/database pattern must be blocked unless an explicit break-glass variable is present.
- Secret scanning must catch connection strings, webhook secrets and common API-token patterns without scanning generated/vendor directories.
- Device/server ingestion credentials must never be returned by an API response or included in browser code.
- CI must run tests, lint and build on every pull request and fail on secret-scan violations.

---

### Task 1: Establish automated test runner and CI baseline

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/config/__tests__/smoke.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing TypeScript/Next.js project configuration.
- Produces: `bun run test`, `bun run test:watch`, and CI gates for test/lint/build.

- [ ] **Step 1: Write the failing smoke test**

Create `src/lib/config/__tests__/smoke.test.ts` with a single `describe('test harness')` case asserting `1 + 1 === 2`.

- [ ] **Step 2: Run the test before test infrastructure exists**

Run: `bun run test`
Expected: FAIL because the `test` script/Vitest is not configured.

- [ ] **Step 3: Add Vitest configuration and scripts**

Add dev dependencies `vitest`, `jsdom`, `@testing-library/react`, and `@testing-library/jest-dom`; add scripts `test: vitest run` and `test:watch: vitest`. Configure `@/` alias and `src/test/setup.ts`.

- [ ] **Step 4: Add CI workflow**

Create `.github/workflows/ci.yml` to checkout, set up Bun, install with frozen lockfile, run `bun run test`, `bun run lint`, and `bun run build` with a non-production test `DATABASE_URL` placeholder that does not make a network connection during build.

- [ ] **Step 5: Verify baseline**

Run: `bun run test && bun run lint && bun run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock vitest.config.ts src/test/setup.ts src/lib/config/__tests__/smoke.test.ts .github/workflows/ci.yml
git commit -m "test: add regression test and CI baseline"
```

### Task 2: Replace ad-hoc database URL loading with safe server configuration

**Files:**
- Create: `src/lib/config/database-url.ts`
- Create: `src/lib/config/__tests__/database-url.test.ts`
- Modify: `src/lib/db.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: `resolveDatabaseUrl(env: NodeJS.ProcessEnv, nodeEnv: string): string` and `assertSafeDatabaseTarget(url: string, nodeEnv: string, allowProductionDbInDev: boolean): void`.
- Consumes: `DATABASE_URL`, `ALLOW_PRODUCTION_DB_IN_DEV`.

- [ ] **Step 1: Write failing configuration tests**

Tests must assert: missing URL throws; malformed URL throws; `mysql://` is normalized to `mariadb://`; non-production mode blocks the production host/database fingerprint unless `ALLOW_PRODUCTION_DB_IN_DEV=true`; production accepts its configured URL.

- [ ] **Step 2: Run focused tests**

Run: `bunx vitest run src/lib/config/__tests__/database-url.test.ts`
Expected: FAIL because functions do not exist.

- [ ] **Step 3: Implement `database-url.ts`**

Keep parsing server-only. Do not read `.env` manually from source code; use `process.env` supplied by the runtime. Export the two signatures above and a small `extractDatabaseName(url: string): string` helper.

- [ ] **Step 4: Refactor `src/lib/db.ts`**

Use `resolveDatabaseUrl(process.env, process.env.NODE_ENV ?? 'development')`; remove `readFileSync`/manual `.env` parsing and fallback-to-known-production-database behavior.

- [ ] **Step 5: Add `.env.example`**

Document variable names only, with local/staging placeholder values and no real secrets.

- [ ] **Step 6: Verify**

Run: `bunx vitest run src/lib/config/__tests__/database-url.test.ts && bun run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/config/database-url.ts src/lib/config/__tests__/database-url.test.ts src/lib/db.ts .env.example
git commit -m "security: isolate database configuration"
```

### Task 3: Add repository secret scanning and redact tracked operational secrets

**Files:**
- Create: `scripts/secret-scan.ts`
- Create: `scripts/__tests__/secret-scan.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `agent-ctx/KNOWLEDGE-BASE.md`

**Interfaces:**
- Produces: CLI command `bun run security:scan` with exit code `0` clean / `1` findings.
- Scanner ignores `.git`, `.next`, `node_modules`, `src/generated`, lockfiles and approved fixtures.

- [ ] **Step 1: Write scanner tests**

Fixtures/assertions cover database URLs with credentials, 32+ byte webhook secrets, private-key headers and generic `*_SECRET=`/`*_TOKEN=` assignments; benign placeholders must not fail.

- [ ] **Step 2: Run tests and confirm failure**

Run: `bunx vitest run scripts/__tests__/secret-scan.test.ts`
Expected: FAIL because scanner is absent.

- [ ] **Step 3: Implement scanner and script**

Export `scanText(path: string, content: string): Finding[]` and `scanRepository(root: string): Promise<Finding[]>`. CLI prints paths and rule IDs, never full secret values.

- [ ] **Step 4: Redact tracked documentation**

Replace real IP-sensitive credentials, database password/URL and webhook secret values in `agent-ctx/KNOWLEDGE-BASE.md` with named placeholders such as `<stored-on-vps>`; retain operational instructions that are not secrets.

- [ ] **Step 5: Add CI gate**

Run `bun run security:scan` before tests/build.

- [ ] **Step 6: Verify repository scan**

Run: `bun run security:scan`
Expected: PASS with zero findings in tracked source.

- [ ] **Step 7: Commit**

```bash
git add scripts/secret-scan.ts scripts/__tests__/secret-scan.test.ts package.json .github/workflows/ci.yml agent-ctx/KNOWLEDGE-BASE.md
git commit -m "security: add secret scanning and redact tracked credentials"
```

### Task 4: Rotate production credentials and isolate network/database access

**Files:**
- Modify on VPS only: `/home/ifleetpro/app/.env`
- Modify on VPS only: webhook configuration storing deploy secret
- Modify on VPS only: MariaDB user/grants/firewall configuration
- Create: `docs/operations/security-rotation-runbook.md`

**Interfaces:**
- Produces: new DB credential, new deployment webhook secret, restricted DB network policy, separate staging/development credentials.
- No secret values are committed.

- [ ] **Step 1: Write the rotation runbook**

Document exact preflight backup, credential rotation, application update, webhook update, database-grant restriction, firewall verification, restart, smoke-test and rollback steps. Use placeholders for all secret values.

- [ ] **Step 2: Take a database backup and record pre-rotation health**

Run on authorized VPS: database dump + HTTP health/login/trip-list smoke checks.
Expected: backup succeeds and existing app remains healthy.

- [ ] **Step 3: Rotate database and webhook credentials**

Create a new least-privilege application DB user/password; update server `.env`; replace deploy webhook secret; remove superseded credentials.

- [ ] **Step 4: Restrict database exposure**

Remove unrestricted `%`/public access where operationally possible; allow only required app/staging/admin sources. Close public `3306` if no external DB consumer requires it.

- [ ] **Step 5: Create non-production database target**

Create staging/development database/user and configure local development to use it rather than production.

- [ ] **Step 6: Verify production and staging**

Run application health/login/read-write smoke checks against each intended environment and confirm old credentials fail.

- [ ] **Step 7: Commit runbook only**

```bash
git add docs/operations/security-rotation-runbook.md
git commit -m "docs: add production credential rotation runbook"
```

### Task 5: Establish interim machine-ingestion authentication contract

**Files:**
- Create: `src/lib/security/machine-auth.ts`
- Create: `src/lib/security/__tests__/machine-auth.test.ts`
- Create: `src/app/api/internal/ingest/health/route.ts`

**Interfaces:**
- Produces: `verifyMachineRequest(request: Request, secret: string): { ok: true; keyId: string } | { ok: false; reason: string }` using `X-iFleet-Key-Id`, timestamp and HMAC signature.
- This is the interim contract consumed by Phase 3 provider adapters; it is not exposed to browser code.

- [ ] **Step 1: Write HMAC authentication tests**

Cover valid signature, unknown key ID, stale timestamp, tampered body and replayed signature nonce.

- [ ] **Step 2: Run tests to confirm failure**

Run: `bunx vitest run src/lib/security/__tests__/machine-auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement verifier**

Use Web Crypto/Node crypto constant-time comparison; reject timestamps outside five minutes and require nonce storage interface injection rather than global mutable state.

- [ ] **Step 4: Add authenticated health route**

`POST /api/internal/ingest/health` validates the machine request and returns only `{ ok: true }` plus server timestamp; no credential metadata.

- [ ] **Step 5: Verify**

Run: `bunx vitest run src/lib/security/__tests__/machine-auth.test.ts && bun run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security/machine-auth.ts src/lib/security/__tests__/machine-auth.test.ts src/app/api/internal/ingest/health/route.ts
git commit -m "security: add machine ingestion authentication contract"
```

## Phase 0 Exit Gate

Phase 0 is complete only when: the repository scan is clean; old production DB/webhook credentials no longer work; local/staging no longer points to production DB by default; CI test/lint/build/security gates pass; and machine-ingestion authentication tests are green.
