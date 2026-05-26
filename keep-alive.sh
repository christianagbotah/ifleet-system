#!/bin/bash
# keep-alive.sh — Restarts Next.js dev server if it dies
cd /home/z/my-project
while true; do
  echo "[$(date '+%H:%M:%S')] Starting dev server..."
  bun run dev 2>&1 | tee -a /home/z/my-project/dev.log
  EXIT_CODE=$?
  echo "[$(date '+%H:%M:%S')] Server exited (code=$EXIT_CODE), restarting in 3s..."
  sleep 3
done
