#!/bin/bash
# ══════════════════════════════════════════════════════════════
# iFleetPro — Database Backup Script (MySQL)
# ══════════════════════════════════════════════════════════════
# Run daily via cron: 0 2 * * * /home/ifleetpro/backups/backup-db.sh
# ══════════════════════════════════════════════════════════════

# ── Configuration ──
BACKUP_DIR="/home/ifleetpro/backups"
DB_NAME="ifleetpro"
DB_USER="ifleetpro"
DB_PASS="a-strong-password-here"   # ← CHANGE THIS to your actual MySQL password
MAX_BACKUPS=30                     # Keep last 30 days

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ifleetpro_$TIMESTAMP.sql"

# Create MySQL dump
echo "[$(date)] Starting MySQL backup..."
mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "[$(date)] ERROR: mysqldump failed. Check DB_USER and DB_PASS in this script."
    exit 1
fi

# Compress backup
gzip "$BACKUP_FILE"
echo "[$(date)] Backup created: $BACKUP_FILE.gz"

# Remove old backups (keep last N)
ls -t "$BACKUP_DIR"/ifleetpro_*.sql.gz 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f 2>/dev/null
echo "[$(date)] Old backups cleaned up (keeping last $MAX_BACKUPS)"
