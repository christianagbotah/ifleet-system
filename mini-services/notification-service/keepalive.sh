#!/bin/bash
# iFleetPro — Notification Service Keepalive
# Restarts the notification service if it dies.
# Usage: nohup bash keepalive.sh </dev/null >/dev/null 2>&1 &

# Derive paths dynamically so this works on any machine / VPS
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_DIR="$SCRIPT_DIR"
LOG_FILE="$SCRIPT_DIR/../../notification-service.log"
MAX_RESTART_DELAY=30

restart_delay=1

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting notification service..."

  # Source parent .env for shared environment variables (INTERNAL_API_KEY, etc.)
  if [ -f "$SERVICE_DIR/../../.env" ]; then
    set -a; source "$SERVICE_DIR/../../.env"; set +a
  fi

  # Start the service with stdin closed to prevent SIGHUP on terminal close
  BUN_CMD="${BUN_CMD:-bun}"
  cd "$SERVICE_DIR" && $BUN_CMD index.ts </dev/null 2>&1 &
  SERVICE_PID=$!

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Notification service PID: $SERVICE_PID"

  # Wait for it to exit
  wait $SERVICE_PID
  EXIT_CODE=$?

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Notification service exited with code: $EXIT_CODE. Restarting in ${restart_delay}s..."

  sleep $restart_delay

  # Exponential backoff up to max
  restart_delay=$((restart_delay * 2))
  if [ $restart_delay -gt $MAX_RESTART_DELAY ]; then
    restart_delay=$MAX_RESTART_DELAY
  fi
done
