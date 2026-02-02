#!/usr/bin/env bash
set -euo pipefail

# Basic prereq: git
if ! command -v git >/dev/null 2>&1; then
  echo "Git is required. Install Git first and re-run this script."
  exit 1
fi

# Assume repo already cloned and script is run from repo root
if [ ! -f package.json ]; then
  echo "Run this script from the repo root (package.json not found)."
  exit 1
fi

# Install Homebrew if missing
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found. Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

# Install Node.js LTS if missing
if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js (LTS)..."
  brew install node
fi

# Install app dependencies
npm install

echo ""
echo "Setup complete."
echo "To launch the app:"
echo "  npm run dev"

echo ""
read -r -p "Do you want to package the app now? (y/N) " package_now
case "${package_now:-}" in
  y|Y|yes|YES)
    npm run package:mac
    ;;
  *)
    ;;
esac
