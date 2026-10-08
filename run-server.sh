#!/bin/bash
cd "$(dirname "$0")"
: "${DATABASE_URL:?DATABASE_URL must be set in the environment}"
while true; do
  echo "$(date) - Starting Next.js dev server..."
  bunx next dev -p 3000 2>&1
  echo "$(date) - Server exited with code $?. Restarting in 3s..."
  sleep 3
done
