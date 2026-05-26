#!/bin/bash
# Auto-commit and push changes to GitHub
cd /home/z/my-project

# Stage all changes
git add -A

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "[$(date)] No changes to push."
    exit 0
fi

# Commit
git commit -m "auto-push: $(date +%Y-%m-%d\ %H:%M)" --allow-empty-message 2>/dev/null

# Push
git push origin main 2>&1

echo "[$(date)] Pushed successfully."
