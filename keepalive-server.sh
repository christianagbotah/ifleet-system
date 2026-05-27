#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting standalone server..."
  NODE_ENV=production node .next/standalone/server.js
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
