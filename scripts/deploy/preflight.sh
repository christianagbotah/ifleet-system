#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
MIN_FREE_MB="${MIN_DEPLOY_FREE_MB:-2048}"

fail() { echo "PRE-FLIGHT FAILED: $1" >&2; exit 1; }
require_env() { [ -n "${!1:-}" ] || fail "$1 is required"; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "missing executable: $1"; }

require_env DATABASE_URL
require_env NEXTAUTH_SECRET
for cmd in bun git pm2 curl df; do require_cmd "$cmd"; done
[ -d "$APP_DIR/prisma/migrations" ] || fail "prisma/migrations is missing"
[ -f "$APP_DIR/prisma/schema.prisma" ] || fail "prisma/schema.prisma is missing"

free_kb=$(df -Pk "$APP_DIR" | awk 'NR==2 {print $4}')
[ -n "$free_kb" ] || fail "unable to determine free disk space"
free_mb=$((free_kb / 1024))
[ "$free_mb" -ge "$MIN_FREE_MB" ] || fail "insufficient disk headroom: ${free_mb}MB available; ${MIN_FREE_MB}MB required"

cd "$APP_DIR"
printf 'SELECT 1;\n' | bunx prisma db execute --stdin >/dev/null 2>&1 || fail "database connectivity check failed"

if [ "${REQUIRE_DEPLOY_BACKUP:-0}" = "1" ]; then
  [ -n "${DEPLOY_BACKUP_HOOK:-}" ] || fail "DEPLOY_BACKUP_HOOK is required"
  [ -x "$DEPLOY_BACKUP_HOOK" ] || fail "DEPLOY_BACKUP_HOOK is not executable"
fi

echo "Preflight passed: environment, database, migrations, disk and executables are ready."
