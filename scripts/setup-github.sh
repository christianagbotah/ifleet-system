#!/usr/bin/env bash
# FleetPro Ghana - GitHub Setup Helper
# Run this script to connect your project to GitHub

export PATH="$HOME/bin:$PATH"

echo "=========================================="
echo "  FleetPro Ghana — GitHub Setup"
echo "=========================================="
echo ""

# Check if gh is installed
if ! command -v gh &>/dev/null; then
  echo "❌ GitHub CLI not found. Installing..."
  mkdir -p /tmp/gh-install
  cd /tmp/gh-install
  curl -fsSL https://github.com/cli/cli/releases/download/v2.63.2/gh_2.63.2_linux_amd64.tar.gz -o gh.tar.gz
  tar xzf gh.tar.gz
  mkdir -p ~/bin
  cp gh_2.63.2_linux_amd64/bin/gh ~/bin/gh
  export PATH="$HOME/bin:$PATH"
  echo "✅ GitHub CLI installed."
fi

echo ""
echo "Step 1: Authenticate with GitHub"
echo "------------------------------"
echo "You need a Personal Access Token (PAT) with 'repo' scope."
echo "Create one at: https://github.com/settings/tokens"
echo ""
read -rp "Paste your GitHub Personal Access Token: " TOKEN

if [ -z "$TOKEN" ]; then
  echo "❌ No token provided. Exiting."
  exit 1
fi

# Authenticate
echo "$TOKEN" | gh auth login --with-token 2>&1

if gh auth status &>/dev/null; then
  echo "✅ Authenticated successfully!"
else
  echo "❌ Authentication failed. Check your token."
  exit 1
fi

echo ""
echo "Step 2: Configure Git"
echo "--------------------"
read -rp "Your GitHub username: " GH_USER
read -rp "Your email (for commits): " GH_EMAIL

if [ -n "$GH_USER" ]; then
  git config --global user.name "$GH_USER"
fi
if [ -n "$GH_EMAIL" ]; then
  git config --global user.email "$GH_EMAIL"
fi
echo "✅ Git configured."

echo ""
echo "Step 3: Create GitHub Repository"
echo "-------------------------------"
REPO_NAME="fleetpro-ghana"
read -rp "Repository name [fleetpro-ghana]: " INPUT_NAME
if [ -n "$INPUT_NAME" ]; then
  REPO_NAME="$INPUT_NAME"
fi

read -rp "Make repo private? [Y/n]: " PRIVATE
if [[ "$PRIVATE" =~ ^[Nn] ]]; then
  VISIBILITY="public"
else
  VISIBILITY="private"
fi

echo "Creating repository '$REPO_NAME' ($VISIBILITY)..."
gh repo create "$REPO_NAME" --"$VISIBILITY" --source=. --remote=origin --push 2>&1

echo ""
echo "=========================================="
echo "  ✅ Setup Complete!"
echo "=========================================="
echo ""
echo "Your project is now connected to GitHub:"
echo "  Remote: $(git remote get-url origin 2>/dev/null)"
echo "  Auto-commit cron will push to this remote every 30 minutes."
echo ""
