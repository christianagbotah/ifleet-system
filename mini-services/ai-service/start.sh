#!/bin/bash
# Source parent .env for shared environment variables
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../.."/.env ]; then
  set -a; source "$SCRIPT_DIR/../.."/.env; set +a
fi
cd "$SCRIPT_DIR"
exec bun index.ts
