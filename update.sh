#!/bin/bash
# iFleetPro — controlled production update

set -euo pipefail
export NODE_ENV=production

APP_DIR="/home/lightworld/webapps/ifleetpro"
GREEN='\033[0;32m'
NC='\033[0m'

cd "$APP_DIR"
git config core.fileMode false

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing update: tracked working-tree changes are present."
  exit 1
fi

echo -e "${GREEN}Updating iFleetPro...${NC}"
git pull --ff-only origin main

bun install --frozen-lockfile 2>/dev/null || bun install
bunx prisma generate
bunx prisma db push
bun run build

systemctl restart ifleetpro.service
systemctl is-active --quiet ifleetpro.service

echo -e "${GREEN}iFleetPro update complete.${NC}"
