# Fleetivo execution backlog

## P0 — Runtime-only deployment consolidation

Checkpoint: temporary generated-directory cleanup completed and basic service availability rechecked; comprehensive worktree consolidation, full functional verification and release migration remain open. This public document intentionally omits internal infrastructure details and operational findings.

- [ ] Inventory all project-owned runtime, development, release and temporary directories; measure allocated bytes and filesystem usage.
- [ ] Identify service dependencies, active processes, locks, persistent data, and backup requirements.
- [ ] Review tracked, untracked, ignored, divergent and stashed source changes. Scan for secrets and customer data before publishing any source; preserve confidential material securely.
- [ ] Verify recoverability through GitHub branches, tags and release artifacts; retain active runtime and one compatible verified rollback per required environment.
- [ ] Remove verified redundant worktrees via Git, prune stale metadata, and remove recoverable obsolete build outputs and temporary copies; record exact actions in secure operational records.
- [ ] Validate web, API, authentication, database, admin, tracking, background jobs, integrations, backup and rollback readiness after each batch.
- [ ] Move all compilation, tests, packaging and release creation to GitHub Actions; deploy checksum-verified minimal runtime artifacts only.
- [ ] Implement and test retention with shared deployment locking, active-service path protection, recovery verification, dry run and auditable deletion records.
- [ ] Record before/after measured storage and completed checks in secure operational records; update this public checkpoint with sanitized completion status only.

## Verified checkpoint

- [x] Removed verified empty generated temporary directory trees under a deployment lock, with path-level records kept in protected operational logs.
- [x] Rechecked public web and runtime service availability following the cleanup batch.
- [ ] Complete review of unresolved local branches, worktrees, stashes and ignored content before removal; do not force-delete when checks time out or recovery is unverified.
- [ ] Replace the existing source-build deployment path with an artifact-only deployment path. Keep the current runtime untouched until a checksum-verified release and tested compatible rollback are available.
- [ ] Verify the full backup/restore chain and authenticated integration checks; do not interpret HTTP availability alone as end-to-end certification.

## Execution rules

Keep the current repository visibility. Never publish secrets, customer information, raw operational logs or unreviewed local changes. Do not delete data or active service dependencies. Continue from the first unblocked task; test, commit, verify and update this checkpoint before moving to the next module.
