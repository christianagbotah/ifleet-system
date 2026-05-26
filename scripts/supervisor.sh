#!/bin/bash
# iFleetPro — Dev Server Supervisor
# Keeps the Next.js dev server AND notification service running by auto-restarting on crash.
# Runs as a background daemon.

PROJECT_DIR="/home/z/my-project"
LOG_FILE="$PROJECT_DIR/dev.log"
PID_FILE="/tmp/fleetpro-next-dev.pid"
NOTIFY_LOG_FILE="$PROJECT_DIR/notification-service.log"
NOTIFY_PID_FILE="/tmp/fleetpro-notification-service.pid"
MAX_RESTART_DELAY=15

# Load project .env to ensure correct DATABASE_URL (shell env may override .env file)
# Use set -a + source for robust handling of special characters in values
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

# ── Notification Service Helper ──

restart_notify_delay=1

start_notification_service() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting notification service on port 3004..." >> "$NOTIFY_LOG_FILE"
  cd "$PROJECT_DIR/mini-services/notification-service" && bun index.ts </dev/null >> "$NOTIFY_LOG_FILE" 2>&1 &
  local pid=$!
  echo $pid > "$NOTIFY_PID_FILE"
  echo $pid
}

# Start the notification service in a background loop
(
  notify_delay=1
  while true; do
    notify_pid=$(start_notification_service)
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Notification service PID: $notify_pid (supervised)" >> "$NOTIFY_LOG_FILE"
    
    # Wait for it to exit
    wait $notify_pid 2>/dev/null
    exit_code=$?
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Notification service exited (code: $exit_code). Restarting in ${notify_delay}s..." >> "$NOTIFY_LOG_FILE"
    
    sleep $notify_delay
    
    notify_delay=$((notify_delay * 2))
    if [ $notify_delay -gt $MAX_RESTART_DELAY ]; then
      notify_delay=$MAX_RESTART_DELAY
    fi
  done
) &

# ── Next.js Dev Server ──

restart_delay=1

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Next.js dev server on port 3000..." >> "$LOG_FILE"
  
  cd "$PROJECT_DIR" && npx next dev -p 3000 -H 0.0.0.0 >> "$LOG_FILE" 2>&1 &
  CHILD_PID=$!
  echo $CHILD_PID > "$PID_FILE"
  
  # Wait for child to exit
  wait $CHILD_PID 2>/dev/null
  EXIT_CODE=$?
  
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dev server exited (code: $EXIT_CODE). Restarting in ${restart_delay}s..." >> "$LOG_FILE"
  
  sleep $restart_delay
  
  # Exponential backoff up to max
  restart_delay=$((restart_delay * 2))
  if [ $restart_delay -gt $MAX_RESTART_DELAY ]; then
    restart_delay=$MAX_RESTART_DELAY
  fi
done
