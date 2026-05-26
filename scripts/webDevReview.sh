#!/usr/bin/env bash
# ============================================================
# webDevReview — Auto code-quality review script
# Cron job: runs every 15 minutes (Africa/Accra timezone)
# ============================================================

set -euo pipefail

TIMESTAMP="$(TZ='Africa/Accra' date '+%Y-%m-%d %H:%M:%S %Z')"
LOG_DIR="/home/z/my-project/.logs/reviews"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/webDevReview.log"

echo "" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"
echo "[${TIMESTAMP}] webDevReview — lint check" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

cd /home/z/my-project

# Run lint, filter out ifleet-fresh noise, keep last 5 lines
OUTPUT=$(bun run lint 2>&1 | grep -v "ifleet-fresh" | tail -5)

if [ -z "$OUTPUT" ]; then
  echo "[${TIMESTAMP}] No lint issues found (clean)." >> "$LOG_FILE"
else
  echo "$OUTPUT" >> "$LOG_FILE"
fi

echo "Review complete at ${TIMESTAMP}" >> "$LOG_FILE"
