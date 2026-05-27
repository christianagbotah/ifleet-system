#!/bin/bash
# ══════════════════════════════════════════════════════════════
# iFleetPro — GitHub Webhook Auto-Deploy Handler
# ══════════════════════════════════════════════════════════════
#
# This script is triggered by GitHub webhooks when you push
# to the main branch. It pulls the latest code, rebuilds,
# and restarts the app via PM2.
#
# Called by: webhook tool (adnanh/webhook)
# Config:    hooks.json (NOT tracked in git)
#
# ══════════════════════════════════════════════════════════════

set -e

# ── Ensure bun and pm2 are in PATH (systemd services have minimal PATH) ──
export PATH="/root/.bun/bin:/usr/local/apps/nodejs20/bin:/usr/local/bin:/usr/lib/node_modules/.bin:$PATH"

# ── Configuration ──
APP_DIR="/home/ifleetpro/app"
LOG_DIR="/home/ifleetpro/logs"
LOCK_FILE="/tmp/ifleetpro-deploy.lock"
LOG_FILE="$LOG_DIR/deploy.log"

# ── Logging ──
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE" 2>&1
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# ── Prevent concurrent deploys ──
if [ -f "$LOCK_FILE" ]; then
    log "DEPLOY BLOCKED: Another deploy is already running (lock file exists)"
    exit 1
fi

# Clean up lock on exit (even if script fails)
trap 'rm -f "$LOCK_FILE"' EXIT

# Create lock
touch "$LOCK_FILE"

log "════════════════════════════════════════"
log "  AUTO-DEPLOY TRIGGERED"
log "════════════════════════════════════════"

# ── Step 0: Preserve local-only files before git reset ──
log "Preserving local config files..."
cd "$APP_DIR"

# Backup hooks.json (contains real webhook secret — NOT in git)
if [ -f "hooks.json" ]; then
    cp hooks.json /tmp/ifleetpro-hooks.json.bak
    log "Backed up hooks.json"
fi

# Backup .env (contains VPS-specific DATABASE_URL and secrets)
if [ -f ".env" ]; then
    cp .env /tmp/ifleetpro-dotenv.bak
    log "Backed up .env"
fi

# ── Step 1: Pull latest code ──
log "Pulling latest code from GitHub..."

# Discard any local changes to tracked files only
git checkout main --force 2>/dev/null || true
git fetch origin main
git reset --hard origin/main

COMMIT=$(git rev-parse --short HEAD)
BRANCH=$(git branch --show-current)
log "Checked out $COMMIT on $BRANCH"

# ── Step 1b: Restore local config files ──
if [ -f "/tmp/ifleetpro-hooks.json.bak" ]; then
    cp /tmp/ifleetpro-hooks.json.bak hooks.json
    rm -f /tmp/ifleetpro-hooks.json.bak
    log "Restored hooks.json (with webhook secret)"
fi

if [ -f "/tmp/ifleetpro-dotenv.bak" ]; then
    cp /tmp/ifleetpro-dotenv.bak .env
    rm -f /tmp/ifleetpro-dotenv.bak
    log "Restored .env (VPS-specific config)"
fi

# ── Step 1c: Fix Prisma provider if VPS uses MySQL ──
# The git repo uses sqlite for local dev, but VPS uses MySQL.
# Detect from DATABASE_URL and patch the schema accordingly.
DB_URL=$(grep -oP '^DATABASE_URL=\K.*' .env 2>/dev/null || echo "")
if echo "$DB_URL" | grep -qi "^mysql"; then
    log "Detected MySQL DATABASE_URL — patching schema provider..."
    sed -i 's/provider = "sqlite"/provider = "mysql"/' prisma/schema.prisma
    log "Prisma provider set to mysql"
else
    log "Using default Prisma provider (sqlite)"
fi

# ── Step 2: Install dependencies ──
log "Installing main app dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install

log "Installing mini-service dependencies..."
cd "$APP_DIR/mini-services/tracking-service" && bun install 2>/dev/null || true
cd "$APP_DIR/mini-services/notification-service" && bun install 2>/dev/null || true

# ── Step 3: Database ──
cd "$APP_DIR"

log "Generating Prisma client..."
bunx prisma generate

log "Pushing database schema changes..."
bunx prisma db push

# ── Step 4: Build ──
log "Building Next.js application..."
bun run build

# Copy static assets for standalone mode
log "Copying static assets..."
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

# ── Step 5: Restart PM2 ──
log "Restarting PM2 services..."
pm2 restart ifleetpro 2>/dev/null || pm2 start ecosystem.config.js
pm2 save

# ── Step 6: Flush nginx proxy cache ──
# Webuzo's nginx has a 60-minute proxy cache that can serve stale HTML
# (with old chunk filenames). Flush it so browsers get the fresh build.
NGINX_CACHE_DIR="/var/webuzo-data/nginx_proxy_cache/ifleetpro"
if [ -d "$NGINX_CACHE_DIR" ]; then
    log "Flushing nginx proxy cache..."
    rm -rf "$NGINX_CACHE_DIR"/*
    /etc/init.d/nginx restart 2>/dev/null || systemctl reload nginx 2>/dev/null || true
    log "Nginx proxy cache flushed"
else
    log "Nginx cache directory not found — skipping cache flush"
fi

# ── Step 7: Verify ──
sleep 3
PM2_STATUS=$(pm2 describe ifleetpro 2>/dev/null | grep -oP 'status\s*\|\s*\K\w+' | head -1)

log "════════════════════════════════════════"
log "  DEPLOY COMPLETE — $COMMIT"
log "  PM2 Status: $PM2_STATUS"
log "════════════════════════════════════════"
