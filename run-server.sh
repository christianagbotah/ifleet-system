#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

: "${DATABASE_URL:?DATABASE_URL is required in the process environment}"

while true; do
  echo "$(date) - Starting Next.js dev server..."
  bunx next dev -p 3000 2>&1
  exit_code=$?
  echo "$(date) - Server exited with code ${exit_code}. Restarting in 3s..."
  sleep 3
done
