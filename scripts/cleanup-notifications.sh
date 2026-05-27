#!/bin/bash
# iFleetPro — Notification Cleanup Cron
# Runs daily at 2:00 AM to prune notifications older than 90 days

echo "[$(date -Iseconds)] Starting notification cleanup..."

RESPONSE=$(curl -s -X POST http://localhost:3000/api/notifications/cleanup \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: fleetpro-cron-2024" \
  -d '{"olderThanDays": 90}' 2>&1)

echo "[$(date -Iseconds)] Cleanup result: $RESPONSE"
