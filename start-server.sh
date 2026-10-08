#!/bin/bash
set -euo pipefail

APP_DIR="/home/lightworld/webapps/ifleetpro"
cd "$APP_DIR"

export NODE_ENV=production
export PORT="${PORT:-3000}"
exec /root/.bun/bin/bun .next/standalone/server.js
