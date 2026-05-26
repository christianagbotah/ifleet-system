#!/usr/bin/env bash
# iFleetPro - Auto-commit script
# Runs periodically via cron to commit any changes to git

cd /home/z/my-project || exit 1

export PATH="$HOME/bin:$PATH"
export GIT_AUTHOR_NAME="christianagbotah"
export GIT_AUTHOR_EMAIL="christianagbotah@users.noreply.github.com"
export GIT_COMMITTER_NAME="christianagbotah"
export GIT_COMMITTER_EMAIL="christianagbotah@users.noreply.github.com"

# Check if there are any changes to commit
if git diff --quiet && git diff --cached --quiet; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] No changes to commit."
  exit 0
fi

# Count changed files
CHANGED=$(git diff --name-only | wc -l)
STAGED=$(git diff --cached --name-only | wc -l)
TOTAL=$((CHANGED + STAGED))

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found $TOTAL changed file(s)."

# Run lint check (skip if lint binary not available or on errors)
if command -v bun &>/dev/null; then
  echo "Running lint check..."
  cd /home/z/my-project
  if ! bun run lint --quiet 2>&1; then
    echo "Lint errors found. Skipping commit to avoid committing broken code."
    exit 1
  fi
fi

# Stage all changes
cd /home/z/my-project
git add -A

# Check again after staging (some files may be ignored)
if git diff --cached --quiet; then
  echo "No tracked changes after staging."
  exit 0
fi

RE_COMMITTED=$(git diff --cached --name-only | wc -l)

# Commit with descriptive message
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %Z')
git commit -m "auto: ${TIMESTAMP} — ${RE_COMMITTED} file(s) changed

Files:
$(git diff --cached --name-only | sed 's/^/  - /')"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Committed $RE_COMMITTED file(s)."

# Push to remote if configured
REMOTE=$(git remote get-url origin 2>/dev/null)
if [ -n "$REMOTE" ]; then
  echo "Pushing to remote..."
  if git push origin main 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushed to GitHub."
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Push failed (will retry next cron run)."
  fi
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] No remote configured. Run scripts/setup-github.sh to connect to GitHub."
fi
