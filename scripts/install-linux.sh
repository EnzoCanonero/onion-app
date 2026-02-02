#!/usr/bin/env bash
set -euo pipefail

# Assume repo already cloned and script is run from repo root
if [ ! -f package.json ]; then
  echo "Run this script from the repo root (package.json not found)."
  exit 1
fi

REQUIRED_NODE_MAJOR=18

has_node=false
if command -v node >/dev/null 2>&1; then
  has_node=true
fi

need_node=true
if [ "$has_node" = true ]; then
  node_ver=$(node -v | tr -d 'v')
  node_major=${node_ver%%.*}
  if [ "$node_major" -ge "$REQUIRED_NODE_MAJOR" ]; then
    need_node=false
  fi
fi

if [ "$need_node" = true ]; then
  echo "Installing Node.js (>=${REQUIRED_NODE_MAJOR})..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y nodejs npm
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm nodejs npm
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y nodejs npm
  else
    echo "No supported package manager found. Install Node.js LTS manually from https://nodejs.org and re-run."
    exit 1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js installation failed. Install Node.js LTS manually and re-run."
  exit 1
fi

node_ver=$(node -v | tr -d 'v')
node_major=${node_ver%%.*}
if [ "$node_major" -lt "$REQUIRED_NODE_MAJOR" ]; then
  echo "Node.js version ${node_ver} is too old. Install Node.js LTS (>=${REQUIRED_NODE_MAJOR}) from https://nodejs.org and re-run."
  exit 1
fi

npm install

echo ""
echo "Setup complete."
echo "To launch the app:"
echo "  npm run dev"

echo ""
read -r -p "Do you want to package the app now? (y/N) " package_now
case "${package_now:-}" in
  y|Y|yes|YES)
    npm run package:linux
    ;;
  *)
    ;;
esac
