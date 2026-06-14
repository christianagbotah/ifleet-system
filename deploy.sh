#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# iFleetPro — Fresh VPS Deployment Script
# ════════════════════════════════════════════════════════════════════
#
# For Webuzo VPS with MariaDB (local).
# User: lightworld | App dir: /home/lightworld/app
#
# USAGE:
#   1. Run this script as root or lightworld user
#   2. It will prompt for DB password
#   3. Everything gets installed and started
#
# ────────────────────────────────────────────────────────────────────

set -e

APP_USER="${1:-lightworld}"
APP_DIR="/home/$APP_USER/app"
REPO_URL="https://github.com/christianagbotah/ifleet-system.git"
NODE_VERSION="20"
BUN_VERSION="1.3.13"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  iFleetPro — Fresh Deployment${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Check prerequisites ──
echo -e "${YELLOW}[1/10] Checking prerequisites...${NC}"

# Check if running as root
if [ "$(id -u)" -eq 0 ]; then
  echo "  Running as root — will set up for user $APP_USER"
else
  echo "  Running as $(whoami) — setting APP_USER=$(whoami)"
  APP_USER=$(whoami)
  APP_DIR="/home/$APP_USER/app"
fi

# Check git
if ! command -v git &>/dev/null; then
  echo -e "${RED}  ERROR: git is not installed. Run: yum install git -y${NC}"
  exit 1
fi

# Check if bun is installed, if not install it
if ! command -v bun &>/dev/null; then
  echo -e "${YELLOW}  Installing Bun...${NC}"
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
  export PATH="$HOME/.bun/bin:$PATH"
  # If root, also install for APP_USER
  if [ "$(id -u)" -eq 0 ]; then
    su - "$APP_USER" -c 'curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.13"'
    export BUN_INSTALL="/home/$APP_USER/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi
fi

echo -e "${GREEN}  ✓ Prerequisites OK${NC}"
echo ""

# ── Step 2: Create app directory and clone ──
echo -e "${YELLOW}[2/10] Cloning repository...${NC}"

if [ -d "$APP_DIR" ]; then
  echo "  Directory $APP_DIR exists — updating via git pull"
  cd "$APP_DIR"
  git pull origin main
else
  echo "  Cloning to $APP_DIR..."
  if [ "$(id -u)" -eq 0 ]; then
    mkdir -p "$(dirname "$APP_DIR")"
    chown "$APP_USER:$APP_USER" "$(dirname "$APP_DIR")"
    su - "$APP_USER" -c "git clone $REPO_URL $APP_DIR"
  else
    mkdir -p "$(dirname "$APP_DIR")"
    git clone "$REPO_URL "$APP_DIR"
  fi
  cd "$APP_DIR"
fi

echo -e "${GREEN}  ✓ Repository ready${NC}"
echo ""

# ── Step 3: Install dependencies ──
echo -e "${YELLOW}[3/10] Installing dependencies (bun install)...${NC}"
cd "$APP_DIR"
bun install --production 2>&1 | tail -5
echo -e "${GREEN}  ✓ Dependencies installed${NC}"
echo ""

# ── Step 4: Setup .env ──
echo -e "${YELLOW}[4/10] Setting up environment variables...${NC}"

# Prompt for DB password
read -rsp "  Enter MariaDB password for lightworld_db_user: " DB_PASSWORD
echo ""

# Generate secrets
INTERNAL_API_KEY=$(openssl rand -hex 24)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
WARMUP_SECRET=$(openssl rand -hex 16)

cat > "$APP_DIR/.env" << EOF
# ═══ iFleetPro Environment Configuration ═══
# Generated: $(date -Iseconds)

# Database (MariaDB via Webuzo)
DATABASE_URL=mysql://lightworld_db_user:${DB_PASSWORD}@localhost:3306/lightworld_ifleetpro_db

# NextAuth
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=https://ifleetpro.lightworldtech.com

# JWT
JWT_SECRET=${JWT_SECRET}

# Internal API Key (shared between Next.js and mini-services)
INTERNAL_API_KEY=${INTERNAL_API_KEY}

# Warmup secret for scheduler
WARMUP_SECRET=${WARMUP_SECRET}

# SMTP (email) — update with your real credentials
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@lightworldtech.com

# App
NODE_ENV=production
PORT=3000
EOF

chmod 600 "$APP_DIR/.env"

echo -e "${GREEN}  ✓ .env created${NC}"
echo ""

# ── Step 5: Prisma setup ──
echo -e "${YELLOW}[5/10] Setting up database (Prisma)...${NC}"
cd "$APP_DIR"
bunx prisma generate
bunx prisma db push
echo -e "${GREEN}  ✓ Database schema pushed${NC}"
echo ""

# ── Step 6: Build ──
echo -e "${YELLOW}[6/10] Building Next.js application...${NC}"
cd "$APP_DIR"
bun run build 2>&1 | tail -20
echo -e "${GREEN}  ✓ Build complete${NC}"
echo ""

# ── Step 7: Create uploads directory ──
echo -e "${YELLOW}[7/10] Creating uploads directory...${NC}"
mkdir -p "$APP_DIR/uploads/images"
chmod 755 "$APP_DIR/uploads"
echo -e "${GREEN}  ✓ Uploads directory created${NC}"
echo ""

# ── Step 8: Setup mini-services ──
echo -e "${YELLOW}[8/10] Setting up mini-services...${NC}"

# Create .env for AI service
cat > "$APP_DIR/mini-services/ai-service/.env" << EOF
INTERNAL_API_KEY=${INTERNAL_API_KEY}
GROQ_API_KEY=YOUR_GROQ_API_KEY_HERE
EOF
chmod 600 "$APP_DIR/mini-services/ai-service/.env"

# Create .env for notification service
cat > "$APP_DIR/mini-services/notification-service/.env" << EOF
INTERNAL_API_KEY=${INTERNAL_API_KEY}
DATABASE_URL=mysql://lightworld_db_user:${DB_PASSWORD}@localhost:3306/lightworld_ifleetpro_db
EOF
chmod 600 "$APP_DIR/mini-services/notification-service/.env"

# Create .env for tracking service
cat > "$APP_DIR/mini-services/tracking-service/.env" << EOF
INTERNAL_API_KEY=${INTERNAL_API_KEY}
DATABASE_URL=mysql://lightworld_db_user:${DB_PASSWORD}@localhost:3306/lightworld_ifleetpro_db
EOF
chmod 600 "$APP_DIR/mini-services/tracking-service/.env"

# Install mini-service dependencies
cd "$APP_DIR/mini-services/ai-service" && bun install
cd "$APP_DIR/mini-services/notification-service" && bun install
cd "$APP_DIR/mini-services/tracking-service" && bun install

echo -e "${GREEN}  ✓ Mini-services configured${NC}"
echo ""

# ── Step 9: Create PM2 ecosystem ──
echo -e "${YELLOW}[9/10] Creating PM2 process manager config...${NC}"

cat > "$APP_DIR/ecosystem.config.cjs" << 'ECOSYSTEM'
module.exports = {
  apps: [
    {
      name: 'ifleetpro',
      script: '.next/standalone/server.js',
      cwd: '/home/lightworld/app',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
}
ECOSYSTEM

# Fix cwd if APP_USER is different
sed -i "s|/home/lightworld/app|$APP_DIR|g" "$APP_DIR/ecosystem.config.cjs"

echo -e "${GREEN}  ✓ PM2 config created${NC}"
echo ""

# ── Step 10: Start everything ──
echo -e "${YELLOW}[10/10] Starting services...${NC}"

# Start main app with PM2
cd "$APP_DIR"
if command -v pm2 &>/dev/null; then
  pm2 delete ifleetpro 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
  pm2 startup 2>/dev/null || true
else
  echo -e "${YELLOW}  PM2 not found. Installing...${NC}"
  npm install -g pm2
  pm2 start ecosystem.config.cjs
  pm2 save
  pm2 startup 2>/dev/null || true
fi

# Start AI service with keepalive
cd "$APP_DIR/mini-services/ai-service"
fuser -k 3007/tcp 2>/dev/null || true
sleep 1
nohup bash keepalive.sh </dev/null >keepalive-wrapper.log 2>&1 &
AI_PID=$!
echo "  AI service PID: $AI_PID (keepalive)"

# Start notification service with keepalive
cd "$APP_DIR/mini-services/notification-service"
fuser -k 3004/tcp 2>/dev/null || true
sleep 1
nohup bash keepalive.sh </dev/null >keepalive-wrapper.log 2>&1 &
NOTIF_PID=$!
echo "  Notification service PID: $NOTIF_PID (keepalive)"

# Start tracking service with keepalive
cd "$APP_DIR/mini-services/tracking-service"
fuser -k 3005/tcp 2>/dev/null || true
sleep 1
nohup bash keepalive.sh </dev/null >keepalive-wrapper.log 2>&1 &
TRACK_PID=$!
echo "  Tracking service PID: $TRACK_PID (keepalive)"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Services running:"
echo "    • Main App (Next.js):     port 3000 (PM2 managed)"
echo "    • AI Service:             port 3007 (keepalive)"
echo "    • Notification Service:  port 3004 (keepalive)"
echo "    • Tracking Service:      port 3005 (keepalive)"
echo ""
echo "  Useful commands:"
echo "    pm2 logs ifleetpro          — View app logs"
echo "    pm2 restart ifleetpro       — Restart app"
echo "    tail -f mini-services/ai-service/ai-service.log"
echo "    tail -f mini-services/notification-service/notification-service.log"
echo "    tail -f mini-services/tracking-service/tracking-service.log"
echo ""
echo "  To update:"
echo "    cd $APP_DIR"
echo "    git pull && bunx prisma generate && bun run build && pm2 restart ifleetpro"
echo ""
