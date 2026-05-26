# iFleetPro — Complete Knowledge Base

## 1. PROJECT OVERVIEW
- **Name**: iFleetPro Fleet Management System
- **Tech Stack**: Next.js 16 (App Router), Prisma ORM, MySQL (MariaDB 11.8), TailwindCSS, shadcn/ui, Lucide Icons
- **Runtime**: Bun (on VPS), Node/npm (local dev sandbox)
- **Output Mode**: Standalone (next.config.ts has output: 'standalone')
- **Repo**: https://github.com/christianagbotah/ifleet-system.git
- **GitHub Token**: (stored in git remote config, not in this file)
- **Git Remote**: https://github.com/christianagbotah/ifleet-system.git

## 2. SERVER INFRASTRUCTURE

### VPS Details
- **IP**: 163.245.212.15
- **Domain**: ifleetpro.lightworldtech.com
- **Panel**: Webuzo
- **OS**: CentOS/RHEL-based (uses firewall-cmd, /etc/init.d/ scripts)
- **App Directory**: /home/ifleetpro/app
- **Logs Directory**: /home/ifleetpro/logs
- **PM2 User**: root (ifleetpro user's PM2 was disabled)

### Database
- **Engine**: MariaDB 11.8.5 (installed by Webuzo at /usr/local/apps/mariadb118/)
- **Service Name**: mariadb.service (control via systemctl restart mysql.service)
- **Config**: /etc/my.cnf
- **Connection**: mysql://ifleetpro_user:myjesus4mE2018@163.245.212.15:3306/ifleetpro_data
- **Local .env also points to this remote MySQL** (no more SQLite)
- **Remote access enabled**: bind-address = 0.0.0.0, port 3306 open in firewall
- **User granted from %** (any host)

### Nginx (Webuzo)
- **NOT Caddy** — Webuzo uses its own Nginx
- **Restart command**: `/etc/init.d/nginx restart` (NOT systemctl reload nginx)
- **Custom config**: `/etc/nginx/conf.d/ifleetpro.conf` — contains:
  - `set $webuzoproxy http://127.0.0.1:3000`
  - `proxy_no_cache 1` (permanently disables proxy cache to prevent stale "Loading..." issue)
  - `_next/static` location block for browser caching with expires 365d
  - DO NOT add proxy directives that Webuzo already handles (proxy_pass, proxy_buffer_size, etc.)

### Firewall
- **Tool**: firewall-cmd (firewalld)
- **Open ports**: 80, 443, 9000 (webhook), 3000 (Next.js), 3306 (MySQL remote)
- **Command pattern**: `sudo firewall-cmd --add-port=PORT/tcp --permanent && sudo firewall-cmd --reload`

## 3. AUTO-DEPLOY PIPELINE (GitHub → VPS)

**How it works:**
1. Developer pushes to main branch on GitHub
2. GitHub sends webhook POST to http://163.245.212.15:9000/hooks/deploy
3. Webhook binary (adnanh/webhook) receives it, validates SHA256 signature
4. Triggers scripts/webhook-deploy.sh
5. Script: git pull → bun install → prisma generate → prisma db push → bun run build → copy static assets → pm2 restart → flush nginx cache → nginx restart

### Webhook Configuration
- **Binary**: adnanh/webhook running on port 9000
- **Config file**: hooks.json (in .gitignore — NOT in git, preserved during deploys)
- **Secret**: 04a6dc53e79c2dc3e8e61506b228aedea090d681d9d253c95eb1c456a3ddb9d0
- **Trigger**: refs/heads/main only
- **Deploy Script**: scripts/webhook-deploy.sh

```bash
#!/bin/bash
set -e
APP_DIR="/home/ifleetpro/app"
LOG_DIR="/home/ifleetpro/logs"
LOCK_FILE="/tmp/ifleetpro-deploy.lock"
LOG_FILE="$LOG_DIR/deploy.log"

# Preserves hooks.json and .env before git reset
# Steps: pull → install deps → prisma generate → prisma db push → build →
#         copy static → pm2 restart → flush cache → nginx restart
```

### CRITICAL DEPLOY NOTES:
- Schema is already MySQL in git (provider = "mysql" in schema.prisma) — no patching needed
- @db.Text annotations added to all JSON string fields to prevent MySQL VARCHAR(191) truncation
- Static asset copy required for standalone mode:
  ```bash
  cp -r .next/static .next/standalone/.next/
  cp -r public .next/standalone/
  ```
- Deploy lock file at /tmp/ifleetpro-deploy.lock prevents concurrent deploys
- Manual deploy: `sudo bash scripts/webhook-deploy.sh` (NOT sudo scripts/webhook-deploy.sh)

## 4. APPLICATION ARCHITECTURE

### Prisma Schema (prisma/schema.prisma)
- Provider: MySQL
- Relation Mode: prisma (no foreign key constraints in DB)
- Key models: User, Role, Driver, Truck, Trip, Item, Client, Invoice, FuelLog, CashAdvance, DriverWallet, DriverSettlement, LoadingCity, LoadingPoint, DestinationCity, DestinationZone, ZoneRate, PerformanceBenchmark, and many more
- All JSON string fields use @db.Text for MySQL compatibility

### Database URL
- Local .env: `DATABASE_URL=mysql://ifleetpro_user:myjesus4mE2018@163.245.212.15:3306/ifleetpro_data`
- Local dev connects DIRECTLY to production MySQL — no separate local DB

### Key Pages/Routes
- Dashboard: /
- Trips: /trips (list), /trips/[id] (detail)
- Trucks: /trucks
- Drivers: /drivers
- Loading Cities: /loading-cities
- Loading Points: /loading-points
- Destination Cities: /destination-cities
- Destination Zones: /destination-zones
- Zone Rates: /zone-rates
- Cash Advances, Invoices, Payroll, Reports, etc.

### File Upload
- API Route: app/api/upload/route.ts
- Library: lib/api.ts has uploadFiles() function
- Used for: Trip mileage photos (start/end mileage images)

### Trip Form (components/trips/TripForm.tsx)
- Removed: fuel cost, standalone loading location, standalone destination fields
- Added: Multi-file image upload for start mileage
- Rate auto-populates from selected destination zone's ZoneRate
- Revenue auto-calculated (readonly) = Rate
- Sections: Assignment → Loading City & Point → Destination City & Zone → Cargo Details → Financial Details → Customer & Waybill → Mileage & Delivery

### Trip Detail Sheet (components/trips/TripDetailSheet.tsx)
- Includes image gallery with click-to-zoom for start/end mileage photos

### Sidebar Navigation (components/navigation/Sidebar.tsx)
- Operations section: Loading Cities, Loading Points, Destination Cities, Destination Zones
- Finance section: Zone Rates

## 5. PM2 Configuration
- Process name: ifleetpro
- Config file: ecosystem.config.js (in repo)
- Commands: pm2 restart ifleetpro, pm2 logs ifleetpro, pm2 save

## 6. COMMON ISSUES & FIXES

| Issue | Fix |
|-------|-----|
| Nginx cache showing "Loading..." | proxy_no_cache 1 in nginx config + deploy script flushes cache |
| systemctl reload nginx fails | Use /etc/init.d/nginx restart (Webuzo) |
| sudo scripts/webhook-deploy.sh → command not found | Use sudo bash scripts/webhook-deploy.sh |
| MySQL VARCHAR(191) too long for JSON | Add @db.Text to JSON string fields in schema.prisma |
| Deploy stuck at "Installing dependencies" | Run manually: sudo bash scripts/webhook-deploy.sh |
| Port 9000 not reachable | sudo firewall-cmd --add-port=9000/tcp --permanent && sudo firewall-cmd --reload |
| MariaDB restart | sudo systemctl restart mysql.service |
| GIT REBASE LOCKS SANDBOX | NEVER use git pull --rebase. Always use git pull. If conflict, use git merge not git rebase. |

## 7. PENDING TASKS (in priority order)
1. Fix cash advance POST for drivers — the API route for creating cash advances from the driver side is broken
2. Fix wrong params format in driver-incentives/[id] and warehouse/[id] — URL parameters not being parsed correctly
3. Add server-side protection for /driver page (middleware) — restrict access to driver role only
4. Fix rate limiter restart behavior — rate limiter doesn't reset properly on restart

## 8. ENVIRONMENT VARIABLES (.env)
```
DATABASE_URL=mysql://ifleetpro_user:myjesus4mE2018@163.245.212.15:3306/ifleetpro_data
```
Other vars (NEXTAUTH_SECRET, SMTP, Hubtel SMS) are configured on VPS .env only.

## 9. CRITICAL RULES FOR THE AGENT
1. **NEVER use git pull --rebase** — use git pull only. Rebase locks the entire sandbox.
2. Always use `/etc/init.d/nginx restart` on VPS — NOT systemctl.
3. Always use `sudo bash scripts/...` — not `sudo scripts/...`.
4. Don't duplicate nginx directives — Webuzo handles proxy_pass, headers, etc.
5. Push to GitHub triggers auto-deploy — no manual VPS steps needed after push (unless deploy fails).
6. Test with unset DATABASE_URL if old SQLite URL is stuck in shell env.
7. The .env file is in .gitignore — **never commit it**. It exists only on local sandbox and VPS.
