#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel)}"
cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Prisma generated-source check requires a Git working tree: $ROOT" >&2
  exit 2
fi

DRIFT="$(git -c core.fileMode=false status --porcelain --untracked-files=all -- src/generated)"
if [ -n "$DRIFT" ]; then
  echo "Prisma generated client is out of sync with committed src/generated." >&2
  echo "Run 'bunx prisma generate', review the generated changes, and commit them." >&2
  printf '%s\n' "$DRIFT" >&2
  exit 1
fi

echo "Prisma generated client is in sync with committed src/generated."
