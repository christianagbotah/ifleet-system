#!/bin/bash
# Stable webhook launcher. Install this file outside the Git working tree as:
# /home/lightworld/shared/ops/ifleetpro-webhook-deploy.sh
#
# It fetches the exact deployment script from origin/main into a temporary
# snapshot before execution, so git reset cannot modify the running script.

set -euo pipefail
umask 077

APP_DIR="/home/lightworld/webapps/ifleetpro"
SNAPSHOT=$(mktemp /tmp/ifleetpro-webhook-deploy.XXXXXX)

cleanup() {
  rm -f "$SNAPSHOT"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

git -C "$APP_DIR" fetch --quiet origin main
git -C "$APP_DIR" show origin/main:scripts/webhook-deploy.sh > "$SNAPSHOT"

if [[ ! -s "$SNAPSHOT" ]]; then
  echo "Fleetivo webhook launcher: canonical deployment script is empty." >&2
  exit 1
fi

chmod 700 "$SNAPSHOT"
"$SNAPSHOT" "$@"
