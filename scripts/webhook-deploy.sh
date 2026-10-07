#!/usr/bin/env bash
set -euo pipefail

export PATH="/root/.bun/bin:/usr/local/apps/nodejs20/bin:/usr/local/bin:/usr/lib/node_modules/.bin:$PATH"
APP_DIR="${APP_DIR:-/home/ifleetpro/app}"
LOG_DIR="${LOG_DIR:-/home/ifleetpro/logs}"
LOCK_FILE="${LOCK_FILE:-/tmp/ifleetpro-deploy.lock}"
LOG_FILE="$LOG_DIR/deploy.log"
mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }
[ ! -f "$LOCK_FILE" ] || { log "DEPLOY BLOCKED: another deploy is running"; exit 1; }
trap 'rm -f "$LOCK_FILE"' EXIT
touch "$LOCK_FILE"

log "AUTO-DEPLOY TRIGGERED"
cd "$APP_DIR"
[ ! -f hooks.json ] || cp hooks.json /tmp/ifleetpro-hooks.json.bak
[ ! -f .env ] || cp .env /tmp/ifleetpro-dotenv.bak

git fetch origin main
git reset --hard origin/main
COMMIT=$(git rev-parse --short HEAD)
[ ! -f /tmp/ifleetpro-hooks.json.bak ] || { cp /tmp/ifleetpro-hooks.json.bak hooks.json; rm -f /tmp/ifleetpro-hooks.json.bak; }
[ ! -f /tmp/ifleetpro-dotenv.bak ] || { cp /tmp/ifleetpro-dotenv.bak .env; rm -f /tmp/ifleetpro-dotenv.bak; }

# Runtime secrets remain local. Source without printing their values.
set -a
[ ! -f .env ] || . ./.env
set +a
export APP_DIR

log "Installing dependencies"
bun install --frozen-lockfile
for service in mini-services/tracking-service mini-services/notification-service; do
  [ ! -d "$service" ] || (cd "$service" && bun install --frozen-lockfile)
done

log "Running deployment preflight"
scripts/deploy/preflight.sh

if [ -n "${DEPLOY_BACKUP_HOOK:-}" ]; then
  log "Running configured database backup/checkpoint hook"
  "$DEPLOY_BACKUP_HOOK"
elif [ "${REQUIRE_DEPLOY_BACKUP:-0}" = "1" ]; then
  log "DEPLOY FAILED: backup hook required but not configured"
  exit 1
fi

log "Running quality gate"
bun run check
log "Generating Prisma client"
bunx prisma generate
log "Applying reviewed database migrations"
bunx prisma migrate deploy
log "Building Next.js application"
bun run build

log "Restarting PM2 services"
pm2 restart ifleetpro 2>/dev/null || pm2 start ecosystem.config.js
pm2 save

NGINX_CACHE_DIR="/var/webuzo-data/nginx_proxy_cache/ifleetpro"
if [ -d "$NGINX_CACHE_DIR" ]; then
  log "Flushing nginx proxy cache"
  rm -rf "$NGINX_CACHE_DIR"/*
  /etc/init.d/nginx restart 2>/dev/null || systemctl reload nginx 2>/dev/null || true
fi

log "Running post-restart smoke test"
scripts/deploy/smoke-test.sh
log "DEPLOY COMPLETE — $COMMIT"
