# Fleetivo execution backlog

## P0 — Runtime-only deployment consolidation

Checkpoint: audit started; cleanup and recovery validation remain open. This public document intentionally omits internal infrastructure details and operational findings.

- [ ] Inventory all project-owned runtime, development, release and temporary directories; measure allocated bytes and filesystem usage.
- [ ] Identify service dependencies, active processes, locks, persistent data, and backup requirements.
- [ ] Review tracked, untracked, ignored, divergent and stashed source changes. Scan for secrets and customer data before publishing any source; preserve confidential material securely.
- [ ] Verify recoverability through GitHub branches, tags and release artifacts; retain active runtime and one compatible verified rollback per required environment.
- [ ] Remove verified redundant worktrees via Git, prune stale metadata, and remove recoverable obsolete build outputs and temporary copies; record exact actions in secure operational records.
- [ ] Validate web, API, authentication, database, admin, tracking, background jobs, integrations, backup and rollback readiness after each batch.
- [ ] Move all compilation, tests, packaging and release creation to GitHub Actions; deploy checksum-verified minimal runtime artifacts only.
- [ ] Implement and test retention with shared deployment locking, active-service path protection, recovery verification, dry run and auditable deletion records.
- [ ] Record before/after measured storage and completed checks in secure operational records; update this public checkpoint with sanitized completion status only.

## Execution rules

Keep the current repository visibility. Never publish secrets, customer information, raw operational logs or unreviewed local changes. Do not delete data or active service dependencies. Continue from the first unblocked task; test, commit, verify and update this checkpoint before moving to the next module.
