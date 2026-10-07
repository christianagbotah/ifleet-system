#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

tracked_env="$(git ls-files '.env*' | grep -v '^.env.example$' || true)"
if [[ -n "$tracked_env" ]]; then
  echo "Tracked environment file(s) are not allowed:"
  printf '%s\n' "$tracked_env"
  exit 1
fi

tracked_db="$(git ls-files '*.db' '*.sqlite' '*.sqlite3' || true)"
if [[ -n "$tracked_db" ]]; then
  echo "Tracked local database artifact(s) are not allowed:"
  printf '%s\n' "$tracked_db"
  exit 1
fi

python3 - <<'PY'
import re
import subprocess
from pathlib import Path

root = Path.cwd()
files = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
excluded_prefixes = ("skills/", "ifleet-fresh/skills/", "docs/superpowers/")
checks = [
    ("credentialed-db-uri", re.compile(r"(?i)(?:mysql|mariadb)://(?!<)[^\s:`\"'<>]+:[^\s@`\"'<>]+@")),
    ("literal-high-entropy-secret", re.compile(r"(?i)(?:secret|token|api[_ -]?key|password)[\"'\s:=_-]{1,20}[a-f0-9]{32,}")),
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
]

hits = []
for name in files:
    if name.startswith(excluded_prefixes) or name == "bun.lock":
        continue
    path = root / name
    if not path.is_file():
        continue
    try:
        text = path.read_text()
    except (UnicodeDecodeError, OSError):
        continue
    for line_no, line in enumerate(text.splitlines(), 1):
        for label, pattern in checks:
            if label == "credentialed-db-uri" and name.endswith(".test.ts"):
                continue
            if pattern.search(line):
                hits.append((name, line_no, label))

if hits:
    print("Potential tracked secret material detected (values redacted):")
    for name, line_no, label in hits:
        print(f"{name}:{line_no}:{label}")
    raise SystemExit(1)

print("Secret-pattern check passed")
PY
