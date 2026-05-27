#!/bin/bash
# ══════════════════════════════════════════════════════════════
# iFleetPro — Auto-Deploy Setup (Run ONCE on your VPS)
# ══════════════════════════════════════════════════════════════
#
# This script sets up the GitHub webhook auto-deploy system.
# Run it ONCE after your initial deployment (deploy.sh).
#
# Usage:
#   chmod +x setup-autodeploy.sh
#   sudo ./setup-autodeploy.sh
#
# ══════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}[SETUP]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $1"; }
err()   { echo -e "${RED}[ERROR]${NC}  $1"; }
step()  { echo ""; echo -e "${BLUE}━━━ $1 ━━━${NC}"; }

APP_DIR="/home/ifleetpro/app"
LOG_DIR="/home/ifleetpro/logs"
HOOKS_EXAMPLE="$APP_DIR/hooks.json.example"
HOOKS_FILE="$APP_DIR/hooks.json"
SERVICE_FILE="/etc/systemd/system/ifleetpro-webhook.service"
WEBHOOK_BIN="/usr/local/bin/webhook"

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  iFleetPro — Auto-Deploy Setup                  ║"
echo "║  GitHub Webhook → Auto Pull → Build → Restart  ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# ── Check if running as root ──
if [ "$EUID" -ne 0 ]; then
    err "This script must be run as root (use sudo)."
    echo "  sudo ./setup-autodeploy.sh"
    exit 1
fi

# ── Check app directory exists ──
if [ ! -d "$APP_DIR" ]; then
    err "App directory not found: $APP_DIR"
    err "Run deploy.sh first to set up the application."
    exit 1
fi

# ══════════════════════════════════════
# STEP 1: Install webhook tool
# ══════════════════════════════════════
step "STEP 1: Install webhook tool"

if [ -f "$WEBHOOK_BIN" ]; then
    info "webhook is already installed at $WEBHOOK_BIN"
else
    info "Downloading webhook tool (adnanh/webhook)..."
    # Detect architecture
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)  WEBHOOK_ARCH="amd64" ;;
        aarch64) WEBHOOK_ARCH="arm64" ;;
        armv7l)  WEBHOOK_ARCH="armv7" ;;
        *)       WEBHOOK_ARCH="amd64" ;;
    esac

    # Download latest release
    RELEASE_URL="https://github.com/adnanh/webhook/releases/latest/download/webhook-linux-${WEBHOOK_ARCH}.tar.gz"
    TMPDIR=$(mktemp -d)
    
    info "Downloading from: $RELEASE_URL"
    curl -fsSL "$RELEASE_URL" -o "$TMPDIR/webhook.tar.gz"
    tar -xzf "$TMPDIR/webhook.tar.gz" -C "$TMPDIR"

    # The binary might be directly in tmpdir or in a subdirectory
    WEBHOOK_BIN_PATH=$(find "$TMPDIR" -type f -name "webhook" 2>/dev/null | head -1)
    if [ -z "$WEBHOOK_BIN_PATH" ]; then
        err "Could not find webhook binary after extraction"
        ls -laR "$TMPDIR"
        rm -rf "$TMPDIR"
        exit 1
    fi

    mv "$WEBHOOK_BIN_PATH" "$WEBHOOK_BIN"
    chmod +x "$WEBHOOK_BIN"
    rm -rf "$TMPDIR"
    
    info "webhook installed at $WEBHOOK_BIN"
fi

webhook_version=$("$WEBHOOK_BIN" -version 2>&1 | head -1 || echo "unknown")
info "webhook version: $webhook_version"

# ══════════════════════════════════════
# STEP 2: Generate hooks.json with secret
# ══════════════════════════════════════
step "STEP 2: Configure webhook secret"

if [ -f "$HOOKS_FILE" ]; then
    # hooks.json already exists — extract existing secret
    WEBHOOK_SECRET=$(grep -oP '"secret":\s*"\K[^"]+' "$HOOKS_FILE" 2>/dev/null)
    if [ -n "$WEBHOOK_SECRET" ] && [ "$WEBHOOK_SECRET" != "CHANGE_ME_TO_A_RANDOM_SECRET" ]; then
        info "hooks.json already exists with a configured secret"
    else
        warn "hooks.json exists but has placeholder secret — regenerating..."
        WEBHOOK_SECRET=$(openssl rand -hex 32)
        sed -i "s/CHANGE_ME_TO_A_RANDOM_SECRET/$WEBHOOK_SECRET/" "$HOOKS_FILE"
        info "Updated webhook secret in hooks.json"
    fi
elif [ -f "$HOOKS_EXAMPLE" ]; then
    # Copy from example and set real secret
    cp "$HOOKS_EXAMPLE" "$HOOKS_FILE"
    WEBHOOK_SECRET=$(openssl rand -hex 32)
    sed -i "s/CHANGE_ME_TO_A_RANDOM_SECRET/$WEBHOOK_SECRET/" "$HOOKS_FILE"
    info "Created hooks.json from template with new secret"
else
    err "Neither hooks.json nor hooks.json.example found!"
    exit 1
fi

# ══════════════════════════════════════
# STEP 3: Set up deploy script permissions
# ══════════════════════════════════════
step "STEP 3: Set script permissions"

chmod +x "$APP_DIR/scripts/webhook-deploy.sh"
info "Made webhook-deploy.sh executable"

# Ensure log directory exists
mkdir -p "$LOG_DIR"
info "Log directory ready: $LOG_DIR"

# ══════════════════════════════════════
# STEP 4: Install systemd service
# ══════════════════════════════════════
step "STEP 4: Install systemd service"

cp "$APP_DIR/ifleetpro-webhook.service" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable ifleetpro-webhook
systemctl restart ifleetpro-webhook

info "Systemd service installed and started"

# ══════════════════════════════════════
# STEP 5: Get VPS public IP
# ══════════════════════════════════════
step "STEP 5: Determine VPS IP"

VPS_IP=$(curl -4 -s ifconfig.me || curl -4 -s icanhazip.com || echo "YOUR_VPS_IP")
WEBHOOK_PORT=9000
WEBHOOK_URL="http://$VPS_IP:$WEBHOOK_PORT/hooks/ifleetpro-deploy"

# ══════════════════════════════════════
# STEP 6: Firewall check
# ══════════════════════════════════════
step "STEP 6: Firewall check"

if command -v ufw &> /dev/null; then
    if ufw status | grep -q "9000"; then
        info "Port 9000 is already allowed in UFW"
    else
        warn "Port 9000 may need to be opened for GitHub webhooks"
        warn "Run: sudo ufw allow 9000/tcp"
    fi
elif command -v firewall-cmd &> /dev/null; then
    if firewall-cmd --list-ports | grep -q "9000"; then
        info "Port 9000 is already allowed in firewalld"
    else
        warn "Port 9000 may need to be opened for GitHub webhooks"
        warn "Run: sudo firewall-cmd --add-port=9000/tcp --permanent && sudo firewall-cmd --reload"
    fi
else
    warn "Could not detect firewall. Make sure port 9000 is open for GitHub webhooks."
fi

# ══════════════════════════════════════
# STEP 7: Configure nginx for Next.js
# ══════════════════════════════════════
step "STEP 7: Configure nginx for Next.js"

NGINX_CONF_SOURCE="$APP_DIR/nginx-ifleetpro.conf"
NGINX_CONF_DIR="/var/webuzo-data/nginx/custom/domains"
NGINX_CONF_FILE="$NGINX_CONF_DIR/ifleetpro.lightworldtech.com.conf"

if [ -f "$NGINX_CONF_SOURCE" ]; then
    mkdir -p "$NGINX_CONF_DIR"

    if [ -f "$NGINX_CONF_FILE" ]; then
        # Back up existing config
        cp "$NGINX_CONF_FILE" "$NGINX_CONF_FILE.bak.$(date +%Y%m%d%H%M%S)"
        info "Backed up existing nginx config"
    fi

    cp "$NGINX_CONF_SOURCE" "$NGINX_CONF_FILE"
    info "Installed Next.js nginx config to $NGINX_CONF_FILE"

    # Validate and reload nginx
    if nginx -t 2>/dev/null; then
        systemctl reload nginx 2>/dev/null || /etc/init.d/nginx restart 2>/dev/null || true
        info "Nginx config validated and reloaded"

        # Flush any existing proxy cache
        NGINX_CACHE_DIR="/var/webuzo-data/nginx_proxy_cache/ifleetpro"
        if [ -d "$NGINX_CACHE_DIR" ]; then
            rm -rf "$NGINX_CACHE_DIR"/*
            info "Flushed existing nginx proxy cache"
        fi
    else
        err "Nginx config validation failed! Check: nginx -t"
        err "The old config has been backed up."
    fi
else
    warn "nginx-ifleetpro.conf not found — skipping nginx config"
    warn "You may need to manually disable proxy caching for Next.js"
fi

# ══════════════════════════════════════
# STEP 8: Summary
# ══════════════════════════════════════
step "SETUP COMPLETE!"

echo ""
echo -e "${GREEN}✅ Auto-deploy is now configured!${NC}"
echo ""
echo -e "${YELLOW}Now add a webhook in GitHub:${NC}"
echo ""
echo "  1. Go to: https://github.com/christianagbotah/ifleet-system/settings/hooks"
echo "  2. Click ${GREEN}\"Add webhook\"${NC}"
echo "  3. Fill in:"
echo ""
echo -e "     ${BLUE}Payload URL:${NC}     $WEBHOOK_URL"
echo -e "     ${BLUE}Content type:${NC}     application/json"
echo -e "     ${BLUE}Secret:${NC}          $WEBHOOK_SECRET"
echo -e "     ${BLUE}Which events:${NC}     Just the push event"
echo ""
echo "  4. Click ${GREEN}\"Add webhook\"${NC}"
echo ""
echo -e "${YELLOW}Important notes:${NC}"
echo "  - Only pushes to the 'main' branch will trigger a deploy"
echo "  - The deploy takes ~2-3 minutes (pull + build + restart)"
echo "  - Check deploy logs: tail -f $LOG_DIR/deploy.log"
echo ""
echo -e "${YELLOW}Test the webhook:${NC}"
echo "  After adding it in GitHub, click the webhook entry and"
echo "  click \"Recent Deliveries\" → click a delivery → \"Redeliver\""
echo ""
echo -e "  Or test manually from your VPS:"
echo "    curl -X POST http://localhost:$WEBHOOK_PORT/hooks/ifleetpro-deploy"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  systemctl status ifleetpro-webhook   — Check webhook listener status"
echo "  journalctl -u ifleetpro-webhook -f   — View live webhook logs"
echo "  cat $LOG_DIR/deploy.log              — View deploy history"
echo "  pm2 logs ifleetpro                   — View app logs"
echo "  pm2 status                           — Check all services"
echo ""
