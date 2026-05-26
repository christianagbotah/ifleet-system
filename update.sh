#!/bin/bash
# ══════════════════════════════════════════════════════════════
# iFleetPro — Quick Update Script
# ══════════════════════════════════════════════════════════════
# Usage: ./update.sh
# ══════════════════════════════════════════════════════════════

set -e

APP_DIR="/home/ifleetpro/app"
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Updating iFleetPro...${NC}"

cd "$APP_DIR"

# Pull latest code
echo "Pulling latest code..."
git pull origin main

# Install dependencies
echo "Installing dependencies..."
bun install

# Update mini-services
echo "Installing mini-service dependencies..."
cd "$APP_DIR/mini-services/tracking-service" && bun install 2>/dev/null || true
cd "$APP_DIR/mini-services/notification-service" && bun install 2>/dev/null || true

# Generate Prisma client
cd "$APP_DIR"
echo "Generating Prisma client..."
bunx prisma generate

# Update database
echo "Pushing database schema..."
bunx prisma db push

# Build
echo "Building Next.js..."
bun run build

# Copy static assets
echo "Copying static assets..."
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

# Restart services
echo "Restarting services..."
pm2 restart all

echo ""
echo -e "${GREEN}Update complete!${NC}"
pm2 status
