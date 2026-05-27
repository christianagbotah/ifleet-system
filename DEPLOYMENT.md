# iFleetPro — Complete Webuzo Deployment Guide (From Scratch)

> This guide takes you from zero to a fully deployed iFleet System on your InterServer VPS with Webuzo.
> No prior server experience assumed.

---

## 📋 Table of Contents

1. [What You Need Before Starting](#step-0-what-you-need-before-starting)
2. [Connect to Your VPS via SSH](#step-1-connect-to-your-vps-via-ssh)
3. [Log Into Webuzo Control Panel](#step-2-log-into-webuzo-control-panel)
4. [Create a Subdomain](#step-3-create-a-subdomain)
5. [Point Your Subdomain DNS](#step-4-point-your-subdomain-dns)
6. [Install Required Software on VPS](#step-5-install-required-software-on-vps)
7. [Upload Your App Code](#step-6-upload-your-app-code)
8. [Configure Webuzo Node.js App](#step-6b-configure-webuzo-nodejs-app)
9. [Configure Environment Variables](#step-7-configure-environment-variables)
10. [Create MySQL Database](#step-8-create-mysql-database)
11. [Install Dependencies & Build](#step-9-install-dependencies--build)
12. [Set Up the Database](#step-10-set-up-the-database)
13. [Start Services with PM2](#step-11-start-services-with-pm2)
14. [Configure Webuzo Reverse Proxy](#step-12-configure-webuzo-reverse-proxy)
15. [Install Free SSL Certificate](#step-13-install-free-ssl-certificate)
16. [Make Services Auto-Start on Reboot](#step-14-make-services-auto-start-on-reboot)
17. [Set Up Automatic Backups](#step-15-set-up-automatic-backups)
18. [Set Up Auto-Deploy from GitHub](#step-18-set-up-auto-deploy-from-github)
19. [Updating Your App Later](#step-16-updating-your-app-later)
20. [Troubleshooting](#step-17-troubleshooting)

---

## Step 0: What You Need Before Starting

Gather these 3 things before we begin:

| # | What You Need | Where to Find It |
|---|---|---|
| 1 | **VPS IP Address** | Your InterServer welcome email (e.g., `192.168.1.100`) |
| 2 | **Webuzo Login Password** | Same welcome email, or login at `https://your-ip:2004` |
| 3 | **Your Domain Name** | The domain you registered (e.g., `yourcompany.com`) |

---

## Step 1: Connect to Your VPS via SSH

SSH (Secure Shell) lets you type commands directly on your server. Here's how to connect:

### Option A: From Windows

**Using Windows Terminal or PowerShell (built into Windows 10/11):**

1. Press `Win + R`, type `powershell`, press Enter
2. Type this command (replace with your actual VPS IP):
   ```
   ssh root@192.168.1.100
   ```
3. First time it will ask: `Are you sure you want to continue connecting?` → Type **`yes`** and press Enter
4. Enter your root password (from InterServer email) — note: **nothing shows as you type**, that's normal
5. You're in! You'll see a prompt like `root@server:~#`

**Using PuTTY (alternative):**
1. Download PuTTY from https://putty.org
2. Open PuTTY
3. Enter your VPS IP in "Host Name" field
4. Port: `22` (default)
5. Click **Open**
6. Login as: `root`
7. Enter your password

### Option B: From Mac

1. Open **Terminal** (press `Cmd + Space`, type `terminal`)
2. Type:
   ```
   ssh root@192.168.1.100
   ```
3. Type `yes` when prompted
4. Enter your password
5. Done!

### Option C: From Linux

Same as Mac — open any terminal and run:
```
ssh root@192.168.1.100
```

### ✅ Verify You're Connected

Once logged in, type this to confirm:
```
whoami
```
It should respond with: `root`

Type this to check your server:
```
uname -a
```

---

## Step 2: Log Into Webuzo Control Panel

Webuzo has a web-based control panel separate from your app.

1. Open your browser
2. Go to: `https://YOUR_VPS_IP:2004`
3. Login with:
   - **Username:** `root`
   - **Password:** Your VPS root password
4. You'll see the Webuzo dashboard

> ⚠️ **Security Warning:** Your browser may show a "Connection Not Secure" warning. This is normal for self-signed certificates. Click **Advanced → Proceed** to continue.

### Recommended: Change Your Webuzo Password

1. In Webuzo, go to **Settings** (gear icon, top right)
2. Click **Change Password**
3. Set a strong password and save it

---

## Step 3: Create a Subdomain

A subdomain lets you run iFleet on something like `fleet.yourcompany.com` instead of using your main domain.

### In Webuzo:

1. Go to **Domains** in the left sidebar
2. Click **Add Domain** or **Subdomains**
3. Fill in:
   - **Subdomain:** `fleet` (this creates `fleet.yourcompany.com`)
   - **Document Root:** Leave default (it will be something like `/home/fleet/public_html`)
   - **Domain:** Select your main domain (e.g., `yourcompany.com`)
4. Click **Create**

Webuzo will create:
- The subdomain `fleet.yourcompany.com`
- A directory at `/home/fleet/public_html/` (the web root)
- DNS records automatically

### Alternative: Use a Dedicated Domain

If you want to use a completely separate domain (e.g., `ifleetpro.com`):
1. Go to **Domains** → **Add Domain**
2. Enter the domain name
3. Click **Create**

---

## Step 4: Point Your Subdomain DNS

Your subdomain needs to point to your VPS IP address.

### If your domain's DNS is managed elsewhere (Namecheap, GoDaddy, etc.):

1. Log into your domain registrar
2. Find **DNS Management** / **DNS Settings**
3. Add an **A Record**:
   - **Type:** A
   - **Host/Name:** `fleet` (for `fleet.yourcompany.com`)
   - **Value/Points to:** Your VPS IP address
   - **TTL:** 3600 (or default)
4. Save and wait 5-30 minutes for DNS to propagate

### If using Webuzo's DNS (if InterServer manages your domain):

Webuzo should create the DNS record automatically when you added the subdomain in Step 3.

### Verify DNS is Working

On your computer (not on the VPS), open a terminal/command prompt and type:
```
ping fleet.yourcompany.com
```
It should show your VPS IP address. If it doesn't, wait a few more minutes and try again.

---

## Step 5: Install Required Software on VPS

Now SSH back into your VPS and run these commands one at a time:

### 5a. Update Your Server

```bash
# Ubuntu/Debian:
apt update && apt upgrade -y

# CentOS/AlmaLinux:
yum update -y
```

### 5b. Install Node.js (v20 LTS)

```bash
# Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# CentOS/AlmaLinux:
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs
```

Verify:
```bash
node -v
# Should show: v20.x.x
```

### 5c. Install Bun (Fast JavaScript Runtime)

```bash
curl -fsSL https://bun.sh/install | bash
```

After installation, reload your shell:
```bash
source ~/.bashrc
```

Verify:
```bash
bun --version
```

### 5d. Install PM2 (Process Manager — keeps your app running)

```bash
npm install -g pm2
```

Verify:
```bash
pm2 -v
```

### 5e. Install Build Tools

These are needed to compile native dependencies:

```bash
# Ubuntu/Debian:
apt install -y build-essential python3

# CentOS/AlmaLinux:
yum groupinstall -y "Development Tools"
yum install -y python3
```

### 5f. Install MySQL (Database)

> 💡 **Webuzo Note:** Webuzo provides MySQL by default. You can find the MySQL credentials in **Webuzo → Databases → phpMyAdmin**. If you're using Webuzo's built-in MySQL, skip this step and proceed to **Step 8**.

If MySQL is **not** already installed (e.g., bare VPS without Webuzo), install it manually:

```bash
# Ubuntu/Debian:
sudo apt install -y mysql-server && sudo mysql_secure_installation

# CentOS/AlmaLinux:
sudo yum install -y mysql-server && sudo systemctl start mysqld && sudo mysql_secure_installation
```

### ✅ Verify Everything Is Installed

```bash
echo "=== Installation Check ==="
echo "Node.js: $(node -v)"
echo "npm:     $(npm -v)"
echo "Bun:     $(bun --version)"
echo "PM2:     $(pm2 -v)"
echo "========================="
```

All should show version numbers. ✅

---

## Step 6: Upload Your App Code

You need to get your iFleet System code onto the VPS. Choose **one** method:

### Option A: Git Clone (Recommended — easiest to update later)

```bash
# Clone your repository directly into /home/ifleetpro/app
git clone https://github.com/christianagbotah/ifleet-system /home/ifleetpro/app

# Change into the project directory
cd /home/ifleetpro/app
```

### Option B: Upload Files via SFTP

1. Download **FileZilla** from https://filezilla-project.org
2. Open FileZilla
3. Enter:
   - **Host:** `sftp://YOUR_VPS_IP`
   - **Username:** `root`
   - **Password:** Your root password
   - **Port:** `22`
4. Click **Quickconnect**
5. On the RIGHT side (remote), navigate to `/home/ifleetpro/app/`
6. On the LEFT side (local), select your project files
7. Drag and drop all project files to upload

### Create Required Directories

```bash
mkdir -p /home/ifleetpro/app/public/uploads
mkdir -p /home/ifleetpro/logs
mkdir -p /home/ifleetpro/backups
```

---

## Step 6b: Configure Webuzo Node.js App

Webuzo has a built-in **Node.js App** manager that can start and stop your main application. Here's how to configure it:

1. Log into Webuzo at `https://YOUR_VPS_IP:2004`
2. Go to **Apps** → **Install Apps** (or **Node.js** in the sidebar)
3. Look for **Node.js App** and click **Install** or **Configure**
4. Fill in the following fields:

| Setting | Value |
|---|---|
| **Start Command** | `pm2 start /home/ifleetpro/app/ecosystem.config.js` |
| **Stop Command** | `pm2 delete all` |
| **App Directory / Path** | `/home/ifleetpro/app` |
| **Port** | `3000` |

5. Click **Save** or **Start**

> ⚠️ **Important Note:** Webuzo's Node.js App manager only controls the **main app** (port 3000). The tracking service (port 3003) and notification service (port 3004) are **not** managed by Webuzo. To start all 3 services (main + tracking + notifications) via SSH, run:
> ```bash
> cd /home/ifleetpro/app
> pm2 start ecosystem.config.js
> ```
> This starts all services defined in `ecosystem.config.js`. Use `pm2 status` to verify all 3 are online.

---

## Step 7: Configure Environment Variables

The `.env` file stores all your app's secret settings (database, passwords, API keys).

```bash
cd /home/ifleetpro/app

# Create .env from the example file
cp .env.example .env

# Open it in a text editor
nano .env
```

Edit each value:

```env
# ══════════════════════════════════════════════════════
# PRODUCTION — Fill in ALL values below
# ══════════════════════════════════════════════════════

# Database — MySQL
DATABASE_URL=mysql://root:YOUR_MYSQL_PASSWORD@localhost:3306/ifleetpro

# NextAuth — REQUIRED
NEXTAUTH_SECRET=REPLACE-WITH-A-LONG-RANDOM-STRING
NEXTAUTH_URL=https://fleet.yourcompany.com

# Email (SMTP) — Required for password reset
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM="iFleetPro" <noreply@yourcompany.com>

# Hubtel SMS (Ghana) — Optional, leave blank if not using
HUBTEL_CLIENT_ID=
HUBTEL_CLIENT_SECRET=
HUBTEL_SENDER_NAME=iFleetPro

# Paystack Payments — Optional
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
```

### Generate a Secure NEXTAUTH_SECRET

Open a **second SSH terminal** (keep the first one open) and run:

```bash
openssl rand -base64 32
```

Copy the long string it outputs and paste it as your `NEXTAUTH_SECRET`.

### Save and Exit Nano

1. Press `Ctrl + X`
2. Press `Y` to save
3. Press `Enter` to confirm the file name

---

## Step 8: Create MySQL Database

Now create the MySQL database and a dedicated user for your app.

> 💡 **Webuzo users:** You can also do this via **Webuzo → Databases → phpMyAdmin**. The credentials are shown in Webuzo's database panel.

### Via MySQL Command Line

```bash
# Log into MySQL
mysql -u root -p
```

Then run these SQL commands inside the MySQL prompt:

```sql
# Create database
CREATE DATABASE ifleetpro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Create a dedicated user (optional but recommended)
CREATE USER 'ifleetpro'@'localhost' IDENTIFIED BY 'a-strong-password-here';
GRANT ALL PRIVILEGES ON ifleetpro.* TO 'ifleetpro'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Update .env with the New Credentials

```bash
nano /home/ifleetpro/app/.env
```

Update the `DATABASE_URL` to use the dedicated user:

```env
DATABASE_URL=mysql://ifleetpro:a-strong-password-here@localhost:3306/ifleetpro
```

Save and exit (`Ctrl+X`, `Y`, `Enter`).

---

## Step 9: Install Dependencies & Build

This is where all packages are downloaded and the app is compiled for production.

```bash
cd /home/ifleetpro/app
```

### 8a. Install Main App Dependencies

```bash
bun install
```

### 8b. Install Mini-Service Dependencies

```bash
cd /home/ifleetpro/app/mini-services/tracking-service
bun install

cd /home/ifleetpro/app/mini-services/notification-service
bun install
```

### 8c. Generate Prisma Client

```bash
cd /home/ifleetpro/app
bunx prisma generate
```

### 8d. Build the Next.js App

> ⚠️ This takes 2-5 minutes. Your VPS needs at least 2GB RAM. If it fails, see the swap fix below.

```bash
cd /home/ifleetpro/app
bun run build
```

### 8e. Copy Static Files (Required for Standalone Mode)

```bash
cd /home/ifleetpro/app
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
```

### 🔧 If Build Fails (Out of Memory)

If you get a memory error during build, create a swap file:

```bash
# Create 2GB swap file
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Verify it's active
free -h

# Now retry the build
cd /home/ifleetpro/app
bun run build
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
```

To make swap permanent:
```bash
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## Step 10: Set Up the Database

```bash
cd /home/ifleetpro/app

# Create MySQL tables from your Prisma schema
bunx prisma db push
```

This will automatically create all the required tables in your MySQL `ifleetpro` database.

You should see output like:
```
🚀 Your database is now in sync with your Prisma schema.
```

If you have seed data (initial admin user, etc.):
```bash
bunx prisma db seed
```

---

## Step 11: Start Services with PM2

Your iFleet System has 3 separate services that need to run simultaneously:

| Service | Port | Purpose |
|---|---|---|
| Main Next.js App | 3000 | The web application |
| Tracking Service | 3003 | GPS tracking WebSocket |
| Notification Service | 3004 | Push notification WebSocket |

### Start All Services

```bash
cd /home/ifleetpro/app

# Start everything defined in ecosystem.config.js
pm2 start ecosystem.config.js

# Check they're all running
pm2 status
```

You should see something like:

```
┌─────┬────────────────────────────┬─────────┬─────────┐
│ id  │ name                       │ status  │ cpu     │
├─────┼────────────────────────────┼─────────┼─────────┤
│ 0   │ ifleetpro                  │ online  │ 0%      │
│ 1   │ ifleetpro-tracking         │ online  │ 0%      │
│ 2   │ ifleetpro-notifications    │ online  │ 0%      │
└─────┴────────────────────────────┴─────────┴─────────┘
```

All 3 should show **online**. ✅

### Test Each Service

```bash
# Test main app (should return HTML)
curl -s http://localhost:3000 | head -5

# Test notification service health
curl -s http://localhost:3004/health

# Test tracking service
curl -s http://localhost:3003
```

### View Logs

```bash
# See all logs live
pm2 logs

# See logs for just the main app
pm2 logs ifleetpro

# Press Ctrl+C to stop watching logs
```

---

## Step 12: Configure Webuzo Reverse Proxy

This is the **most critical step** — it tells Webuzo's web server (Nginx/Apache) to send all web traffic to your Node.js app running on port 3000.

### 12a. Find Your Web Server Config

Webuzo typically uses **Nginx** as the frontend proxy. Find your config:

```bash
# Check which config files exist
ls /etc/nginx/conf.d/
ls /etc/webuzo/conf/web/
```

### 12b. Create/Edit the Nginx Config for Your Subdomain

```bash
nano /etc/nginx/conf.d/ifleetpro.conf
```

Paste this entire block (replace `fleet.yourcompany.com` with your actual subdomain):

```nginx
# ══════════════════════════════════════════════════════════
# iFleetPro — Nginx Reverse Proxy Configuration
# ══════════════════════════════════════════════════════════

server {
    listen 80;
    listen [::]:80;

    # Replace with YOUR subdomain
    server_name fleet.yourcompany.com;

    # ── Main Next.js App (port 3000) ──
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        proxy_send_timeout 300s;

        # File upload size limit (50MB)
        client_max_body_size 50M;
    }

    # ── WebSocket: Tracking Service (port 3003) ──
    location ~* /.*XTransformPort=3003 {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # ── WebSocket: Notification Service (port 3004) ──
    location ~* /.*XTransformPort=3004 {
        proxy_pass http://127.0.0.1:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # ── Health check endpoint ──
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }
}
```

Save and exit (`Ctrl+X`, `Y`, `Enter`).

### 12c. If Using Apache (Alternative)

If your Webuzo is using Apache instead of Nginx, or if the above doesn't work, find your Apache config:

```bash
# Find the right config file
ls /etc/apache2/sites-enabled/
ls /etc/httpd/conf.d/
```

Edit the VirtualHost for your subdomain:
```bash
nano /etc/apache2/sites-enabled/fleet.yourcompany.com.conf
```

Add **before** any existing `ProxyPass` lines:

```apache
# iFleetPro Reverse Proxy
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/

# WebSocket: Tracking (port 3003)
RewriteEngine On
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteCond %{QUERY_STRING} XTransformPort=3003 [OR]
RewriteCond %{QUERY_STRING} XTransformPort=3004
RewriteRule /(.*) ws://127.0.0.1:%{ENV:REDIRECT_STATUS} [P,L]

# Increase timeouts
Timeout 300
ProxyTimeout 300
LimitRequestBody 52428800
```

### 12d. Test and Restart Web Server

```bash
# Test Nginx config (if using Nginx)
nginx -t

# Restart Nginx
systemctl restart nginx

# OR restart Apache (if using Apache)
systemctl restart httpd
# OR
systemctl restart apache2
```

### 12e. Verify It Works

Open your browser and go to:
```
http://fleet.yourcompany.com
```

You should see the iFleet login page! 🎉

> If it doesn't work, check Step 17 (Troubleshooting).

---

## Step 13: Install Free SSL Certificate

### Option A: Via Webuzo Panel (Easiest)

1. Log into Webuzo at `https://YOUR_IP:2004`
2. Go to **SSL Certificates**
3. Look for **Let's Encrypt** or **Free SSL**
4. Select your subdomain: `fleet.yourcompany.com`
5. Check the domain and click **Install** / **Issue Certificate**
6. Wait 30 seconds — it should show "Certificate Installed Successfully"

### Option B: Via Command Line

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Issue certificate
certbot --nginx -d fleet.yourcompany.com

# Follow the prompts:
# - Enter your email
# - Agree to terms (Y)
# - Redirect HTTP to HTTPS (option 2)
```

### Verify SSL

Go to: `https://fleet.yourcompany.com` — you should see a 🔒 padlock in your browser!

### Update .env with HTTPS

```bash
nano /home/ifleetpro/app/.env

# Change NEXTAUTH_URL from http:// to https://
NEXTAUTH_URL=https://fleet.yourcompany.com
```

Restart PM2:
```bash
pm2 restart all
```

---

## Step 14: Make Services Auto-Start on Reboot

If your VPS restarts, you want iFleet to come back up automatically:

```bash
# Generate the startup script
pm2 startup

# PM2 will output a command like this — COPY AND RUN IT:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

Run the exact `sudo` command that PM2 shows you.

Then save the current process list:
```bash
pm2 save
```

Now your app will survive server restarts. ✅

---

## Step 15: Set Up Automatic Backups

### Via Webuzo Cron Jobs

1. Log into Webuzo at `https://YOUR_IP:2004`
2. Go to **Cron Jobs**
3. Click **Add Cron Job**
4. Set:
   - **Timing:** Every day at 2:00 AM
   - **Command:**
   ```
   mysqldump -u ifleetpro -p'a-strong-password-here' ifleetpro > /home/ifleetpro/backups/ifleetpro_$(date +\%Y-\%m-\%d_\%H\%M\%S).sql && gzip /home/ifleetpro/backups/ifleetpro_$(date +\%Y-\%m-\%d_\%H\%M\%S).sql && find /home/ifleetpro/backups -name "*.gz" -mtime +30 -delete
   ```
5. Save

### Or via SSH

```bash
# Make backup script executable
chmod +x /home/ifleetpro/backups/backup-db.sh

# Add to cron (runs daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/ifleetpro/backups/backup-db.sh >> /home/ifleetpro/logs/backup.log 2>&1") | crontab -
```

### Manual Backup

```bash
mysqldump -u ifleetpro -p'a-strong-password-here' ifleetpro > /home/ifleetpro/backups/manual-backup-$(date +%Y%m%d).sql
gzip /home/ifleetpro/backups/manual-backup-$(date +%Y%m%d).sql
```

### Restore from Backup

```bash
# Stop app first
pm2 stop ifleetpro

# Restore
gunzip /home/ifleetpro/backups/ifleetpro_2024-01-15_020000.sql.gz
mysql -u ifleetpro -p'a-strong-password-here' ifleetpro < /home/ifleetpro/backups/ifleetpro_2024-01-15_020000.sql

# Start app again
pm2 start ifleetpro
```

---

## Step 18: Set Up Auto-Deploy from GitHub

This is the **magic step** — every time you push code to GitHub, your VPS will automatically pull it, rebuild, and restart. No more SSHing in to update!

### How It Works

```
You push to GitHub
       │
       ▼
GitHub sends webhook to VPS:9000
       │
       ▼
webhook tool runs scripts/webhook-deploy.sh
       │
       ▼
git pull → bun install → prisma → build → pm2 restart
       │
       ▼
Your app is updated! ✅
```

### One-Time Setup (Run Once After Deploy)

SSH into your VPS and run:

```bash
cd /home/ifleetpro/app
sudo ./setup-autodeploy.sh
```

This script will:
1. Download and install the `webhook` tool
2. Generate a random secret for security
3. Set up the deploy script permissions
4. Install a systemd service that runs the webhook listener on port 9000
5. Display the exact GitHub webhook URL and secret to enter

### Add the Webhook in GitHub

After running the setup script, it will print the webhook URL and secret. Then:

1. Go to **https://github.com/christianagbotah/ifleet-system/settings/hooks**
2. Click **"Add webhook"**
3. Fill in the values the setup script printed:
   - **Payload URL:** `http://YOUR_VPS_IP:9000/hooks/ifleetpro-deploy`
   - **Content type:** `application/json`
   - **Secret:** The 64-character hex string the script printed
   - **Which events:** Select **"Just the push event"**
4. Click **"Add webhook"**

### Test It

After adding the webhook in GitHub:

1. Go to the webhook settings page
2. Click on the webhook you just created
3. Click **"Recent Deliveries"**
4. Click the redeliver icon (circular arrow) on the most recent delivery
5. Check the response — it should say "Deploy triggered"

Or test from your VPS terminal:
```bash
curl -X POST http://localhost:9000/hooks/ifleetpro-deploy
```

Then check the deploy logs:
```bash
cat /home/ifleetpro/logs/deploy.log
pm2 status
```

### What Gets Auto-Deployed

| What | Details |
|---|---|
| Code | `git pull origin main` (force clean) |
| Dependencies | `bun install` for main + mini-services |
| Database | `prisma generate` + `prisma db push` |
| Build | `bun run build` + copy static files |
| Restart | `pm2 restart ifleetpro` |

### Only Main Branch Triggers Deploy

The webhook is configured to **only deploy on pushes to the `main` branch**. Pushing to other branches (if you create them later) will be ignored.

### Manual Deploy (If Webhook Fails)

You can always trigger a manual deploy:

```bash
cd /home/ifleetpro/app
./update.sh
```

### Webhook Troubleshooting

**Check webhook listener is running:**
```bash
systemctl status ifleetpro-webhook
```

**View webhook logs:**
```bash
journalctl -u ifleetpro-webhook -f
# or
tail -f /home/ifleetpro/logs/webhook.out.log
tail -f /home/ifleetpro/logs/webhook.error.log
```

**Restart webhook listener:**
```bash
systemctl restart ifleetpro-webhook
```

**Check if port 9000 is open:**
```bash
ss -tlnp | grep 9000
```

**If port 9000 is blocked by firewall:**
```bash
# Ubuntu/Debian
ufw allow 9000/tcp

# CentOS/AlmaLinux
firewall-cmd --permanent --add-port=9000/tcp
firewall-cmd --reload
```

**Check GitHub webhook delivery status:**
1. Go to GitHub → Settings → Webhooks → your webhook
2. Check "Recent Deliveries" — green check = success, red X = failed
3. Click any delivery to see the request/response details

---

## Step 19: Updating Your App Later

When you push new code to GitHub and want to update your live app:

### Quick Method

```bash
cd /home/ifleetpro/app

# 1. Pull latest code
git pull origin main

# 2. Install any new dependencies
bun install
cd mini-services/tracking-service && bun install && cd ../..
cd mini-services/notification-service && bun install && cd ../..

# 3. Update database (if schema changed)
cd /home/ifleetpro/app
bunx prisma generate
bunx prisma db push

# 4. Rebuild
bun run build
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# 5. Restart all services
pm2 restart all

# 6. Check everything is working
pm2 status
```

### Or use the update script

```bash
chmod +x /home/ifleetpro/app/update.sh
/home/ifleetpro/app/update.sh
```

---

## Step 17: Troubleshooting

### "502 Bad Gateway" or "Site Can't Be Reached"

```bash
# Check if PM2 services are running
pm2 status

# If not running, start them
cd /home/ifleetpro/app
pm2 start ecosystem.config.js
pm2 save
```

### "Page Not Found" or Webuzo Default Page

The reverse proxy is not configured. Re-check **Step 12**.

### WebSocket Not Connecting (Tracking/Notifications)

1. Check Nginx config has WebSocket proxy rules (Step 12b)
2. Check the services are running:
```bash
curl http://localhost:3004/health
```
3. Check Nginx error logs:
```bash
tail -50 /var/log/nginx/error.log
```

### Build Fails with Memory Error

```bash
# Create swap space
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Retry build
cd /home/ifleetpro/app
bun run build
```

### Permission Denied Errors

```bash
# Fix ownership
chown -R root:root /home/ifleetpro
chmod -R 755 /home/ifleetpro
```

### Check Logs

```bash
# PM2 logs
pm2 logs --lines 100

# Nginx error logs
tail -100 /var/log/nginx/error.log

# System logs
journalctl -u nginx --no-pager -n 50
```

### Restart Everything

```bash
pm2 delete all
systemctl restart nginx
cd /home/ifleetpro/app
pm2 start ecosystem.config.js
pm2 save
```

### Check Which Ports Are In Use

```bash
ss -tlnp | grep -E '3000|3003|3004'
```

All 3 ports (3000, 3003, 3004) should show as LISTEN.

---

## 📁 Final File Structure on Your VPS

```
/home/ifleetpro/
├── app/                           ← Application directory
│   ├── .next/standalone/server.js ← Production server
│   ├── .env                       ← Your secrets
│   ├── ecosystem.config.js        ← PM2 config
│   ├── deploy.sh                  ← Deployment script
│   ├── update.sh                  ← Update script
│   ├── prisma/
│   │   └── schema.prisma
│   ├── mini-services/
│   │   ├── tracking-service/      ← Port 3003
│   │   └── notification-service/  ← Port 3004
│   └── public/uploads/            ← Uploaded files
├── logs/                          ← Application logs
└── backups/                       ← Database backups (.sql.gz)
    └── backup-db.sh               ← Backup script
```

---

## ✅ Deployment Checklist

Print this and check off each item as you go:

- [ ] Can SSH into VPS as root
- [ ] Can log into Webuzo at port 2004
- [ ] Subdomain `fleet.yourcompany.com` created in Webuzo
- [ ] DNS A Record pointing subdomain to VPS IP
- [ ] `ping fleet.yourcompany.com` returns VPS IP
- [ ] Node.js v20 installed (`node -v`)
- [ ] Bun installed (`bun --version`)
- [ ] PM2 installed (`pm2 -v`)
- [ ] Code cloned to `/home/ifleetpro/app`
- [ ] `.env` configured with production values
- [ ] `NEXTAUTH_SECRET` generated with `openssl rand -base64 32`
- [ ] Dependencies installed (`bun install`)
- [ ] MySQL database created (Step 8)
- [ ] `DATABASE_URL` updated in `.env` with MySQL credentials
- [ ] Database tables created (`bunx prisma db push`)
- [ ] App built successfully (`bun run build`)
- [ ] Static files copied (`cp -r .next/static .next/standalone/.next/`)
- [ ] PM2 started — all 3 services **online** (`pm2 status`)
- [ ] Nginx reverse proxy configured
- [ ] `http://fleet.yourcompany.com` shows login page
- [ ] SSL certificate installed (HTTPS works with 🔒)
- [ ] `.env` NEXTAUTH_URL updated to `https://`
- [ ] PM2 startup configured (`pm2 startup && pm2 save`)
- [ ] Backup cron job set up
- [ ] Can log in with admin credentials
- [ ] Dashboard loads correctly
- [ ] Auto-deploy set up (`sudo ./setup-autodeploy.sh`)
- [ ] GitHub webhook added and tested
- [ ] `systemctl status ifleetpro-webhook` shows active

---

## 🔑 Default Login Credentials

After database seed, your admin login is:
- **Email:** `admin@fleetpro.com.gh`
- **Password:** `admin123`

> ⚠️ **IMPORTANT:** Change this password immediately after first login! Go to **Profile → Change Password**.

---

## 🏗️ Architecture Diagram

```
                    Internet
                       │
                       ▼
              ┌─────────────────┐
              │  Webuzo Nginx   │
              │  (port 80/443)  │
              │  fleet.your     │
              │  company.com    │
              └────────┬────────┘
                       │  reverse proxy
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             │             ▼
┌─────────────┐        │    ┌──────────────┐
│  Next.js    │        │    │  Tracking    │
│  App        │        │    │  Service     │
│  :3000      │        │    │  :3003       │
└─────────────┘        │    └──────────────┘
                       │
                       ▼
              ┌──────────────┐
              │ Notification │
              │ Service      │
              │ :3004        │
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │    MySQL     │
              │  Database    │
              └──────────────┘
```

---

**Need help?** If you get stuck on any step, SSH into your server and run the troubleshooting commands in Step 16. Most issues are solved by checking `pm2 logs` and `pm2 status`.
