#!/usr/bin/env bash
# ============================================================
# cron-runner.sh — Lightweight cron-like scheduler daemon
# Replaces system cron in sandboxed environments.
# Runs registered jobs at their specified intervals.
# ============================================================

set -euo pipefail

LOG_DIR="/home/z/my-project/.logs/cron"
mkdir -p "$LOG_DIR"
PID_FILE="/home/z/my-project/.cron-runner.pid"

# ── Job definitions ────────────────────────────────────────
# Each job: "name|interval_seconds|command"
JOBS=(
  "webDevReview|900|cd /home/z/my-project && bash /home/z/my-project/scripts/webDevReview.sh"
)

# ── Functions ──────────────────────────────────────────────

log() {
  local ts
  ts="$(TZ='Africa/Accra' date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "[${ts}] $*" | tee -a "${LOG_DIR}/cron-runner.log"
}

run_job() {
  local name="$1" cmd="$2"
  log "Running job: ${name}"
  # Run in subshell, capture output
  bash -c "$cmd" >> "${LOG_DIR}/${name}.log" 2>&1
  local exit_code=$?
  if [ $exit_code -eq 0 ]; then
    log "Job ${name} completed successfully"
  else
    log "Job ${name} failed (exit code: ${exit_code})"
  fi
}

cleanup() {
  log "Cron runner shutting down..."
  rm -f "$PID_FILE"
  exit 0
}

# ── Main loop ──────────────────────────────────────────────

trap cleanup SIGINT SIGTERM

# Write PID
echo $$ > "$PID_FILE"
log "Cron runner started (PID: $$)"
log "Registered ${#JOBS[@]} job(s):"
for job in "${JOBS[@]}"; do
  local name="${job%%|*}"
  log "  - ${name}"
done
log "Timezone: Africa/Accra"

# Initialize last-run timestamps
declare -A LAST_RUN
for job in "${JOBS[@]}"; do
  local name="${job%%|*}"
  LAST_RUN["$name"]=0
done

# Tick every 30 seconds
while true; do
  sleep 30
  local now
  now=$(date +%s)
  for job in "${JOBS[@]}"; do
    IFS='|' read -r name interval cmd <<< "$job"
    local elapsed=$(( now - LAST_RUN["$name"] ))
    if [ "$elapsed" -ge "$interval" ]; then
      run_job "$name" "$cmd"
      LAST_RUN["$name"]=$now
    fi
  done
done
