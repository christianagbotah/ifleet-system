#!/usr/bin/env bash
set -euo pipefail

BUILD_SHA="${NEXT_PUBLIC_BUILD_SHA:-}"
STATIC_DIR=".next/static"

if [[ -z "$BUILD_SHA" ]]; then
  echo "Build metadata verification failed: NEXT_PUBLIC_BUILD_SHA is not set." >&2
  exit 1
fi

if [[ ! -d "$STATIC_DIR" ]]; then
  echo "Build metadata verification failed: $STATIC_DIR does not exist." >&2
  exit 1
fi

SHORT_SHA="${BUILD_SHA:0:12}"

if ! grep -R -F -q --binary-files=without-match "$SHORT_SHA" "$STATIC_DIR"; then
  echo "Build metadata verification failed: $SHORT_SHA is not embedded in browser assets." >&2
  exit 1
fi

if grep -R -F -q --binary-files=without-match 'NEXT_PUBLIC_BUILD_SHA' "$STATIC_DIR"; then
  echo "Build metadata verification failed: browser assets still contain a runtime NEXT_PUBLIC_BUILD_SHA lookup." >&2
  exit 1
fi

echo "Build metadata is embedded in browser assets: $SHORT_SHA"
