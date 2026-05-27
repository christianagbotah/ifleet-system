#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# iFleetPro — Production Deployment Script
# ════════════════════════════════════════════════════════════════════
#
# Run this script on your VPS after uploading/cloning the code.
# It will install dependencies, build the app, and set up PM2.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# ════════════════════════════════════════════════════════════════════

set -e

# ── Configuration ──
APP_DIR="/home/ifleetpro/app"
LOG_DIR="/home/ifleetpro/logs"
DB_DIR="/home/ifleetpro/db"
BACKUP_DIR="/home/ifleetpro/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ══════════════════════════════════════════════════════════════
# STEP 1: Prerequisites Check
# ══════════════════════════════════════════════════════════════

log_info "Checking prerequisites..."

# Check Node.js (v18+)
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Install it via Webuzo or manually."
    exit 1
elif [ "$(node -v | cut -d'.' -f1 | sed 's/v//')" -lt 18 ]; then
    log_error "Node.js v18+ required. Current: $(node -v)"
    exit 1
fi
log_info "Node.js $(node -v) found"

# Check Bun
if ! command -v bun &> /dev/null; then
    log_info "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi
log_info "Bun $(bun --version) found"

# Check PM2
if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2 globally..."
    sudo npm install -g pm2
fi
log_info "PM2 found"

# ══════════════════════════════════════════════════════════════
# STEP 2: Create Directory Structure
# ══════════════════════════════════════════════════════════════

log_info "Creating directory structure..."
mkdir -p "$LOG_DIR" "$DB_DIR" "$BACKUP_DIR"
mkdir -p "$APP_DIR/public/uploads"

# ══════════════════════════════════════════════════════════════
# STEP 3: Install Dependencies
# ══════════════════════════════════════════════════════════════

cd "$APP_DIR"

log_info "Installing main app dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install

log_info "Installing mini-service dependencies..."
cd "$APP_DIR/mini-services/tracking-service"
bun install 2>/dev/null || true

cd "$APP_DIR/mini-services/notification-service"
bun install 2>/dev/null || true

cd "$APP_DIR"

# ══════════════════════════════════════════════════════════════
# STEP 4: Environment Configuration
# ══════════════════════════════════════════════════════════════

if [ ! -f "$APP_DIR/.env" ]; then
    if [ -f "$APP_DIR/.env.example" ]; then
        cp "$APP_DIR/.env.example" "$APP_DIR/.env"
        log_warn ".env created from .env.example — EDIT IT with your production values!"
        log_warn "  - Update DATABASE_URL"
        log_warn "  - Set NEXTAUTH_SECRET (generate with: openssl rand -base64 32)"
        log_warn "  - Set NEXTAUTH_URL to your domain"
        log_warn "  - Configure SMTP, Hubtel SMS, etc."
    else
        log_error ".env.example not found. Create .env manually!"
    fi
else
    log_info ".env already exists — skipping"
fi

# ══════════════════════════════════════════════════════════════
# STEP 5: Database Setup
# ══════════════════════════════════════════════════════════════

log_info "Setting up database..."
cd "$APP_DIR"

# Generate Prisma client
bunx prisma generate

# Push schema to database
bunx prisma db push

# Run seed if exists
if [ -f "prisma/seed.ts" ]; then
    log_info "Running database seed..."
    bunx prisma db seed 2>/dev/null || log_warn "Seed failed or no seed configured"
fi

# ══════════════════════════════════════════════════════════════
# STEP 6: Build Next.js Application
# ══════════════════════════════════════════════════════════════

log_info "Building Next.js application (this may take a few minutes)..."
cd "$APP_DIR"
bun run build

# Copy static assets and public folder for standalone mode
log_info "Copying static assets..."
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

# ══════════════════════════════════════════════════════════════
# STEP 7: Start with PM2
# ══════════════════════════════════════════════════════════════

log_info "Starting services with PM2..."
cd "$APP_DIR"

# Stop existing processes if any
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Start all services
pm2 start ecosystem.config.js

# Save PM2 configuration for auto-restart
pm2 save

# Setup PM2 startup (auto-start on server boot)
pm2 startup 2>/dev/null || log_warn "Run 'pm2 startup' manually and follow the instructions"

# ══════════════════════════════════════════════════════════════
# STEP 8: Verify
# ══════════════════════════════════════════════════════════════

echo ""
log_info "══════════════════════════════════════════════════════"
log_info "  DEPLOYMENT COMPLETE!"
log_info "══════════════════════════════════════════════════════"
echo ""
pm2 status
echo ""
log_info "Services running:"
log_info "  - Main app:       http://localhost:3000"
log_info "  - Tracking WS:    ws://localhost:3003"
log_info "  - Notifications:  ws://localhost:3004"
echo ""
log_warn "NEXT STEPS:"
log_warn "  1. Configure reverse proxy (see DEPLOYMENT.md)"
log_warn "  2. Set up SSL certificate via Webuzo"
log_warn "  3. Verify all services at your domain"
log_warn "  4. Create a cron job for backups"
echo ""
log_info "Useful PM2 commands:"
log_info "  pm2 logs          — View all logs"
log_info "  pm2 monit         — Monitor CPU/memory"
log_info "  pm2 restart all   — Restart all services"
log_info "  pm2 stop ifleetpro — Stop main app"
echo ""
