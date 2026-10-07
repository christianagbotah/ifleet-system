#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${APP_BASE_URL:-http://127.0.0.1:3000}"
CURL_TIMEOUT="${SMOKE_TIMEOUT_SECONDS:-10}"

health=$(curl --fail --silent --show-error --max-time "$CURL_TIMEOUT" "$BASE_URL/api/health")
printf '%s' "$health" | grep -q '"status":"ok"' || { echo "Smoke test failed: /api/health did not report ok" >&2; exit 1; }

curl --fail --silent --show-error --location --max-time "$CURL_TIMEOUT" --output /dev/null "$BASE_URL/login" || {
  echo "Smoke test failed: /login is unavailable" >&2
  exit 1
}

echo "Smoke test passed: health API and login page are reachable."
