#!/bin/bash
# Double-click to start the Model Hub (see docs/hub.md).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node is not installed. Please install Node 22 as described in docs/harness-setup.md,"
  echo "then double-click this file again."
  read -r -p "Press Enter to close. "
  exit 1
fi
# Get the latest code, but only when nothing here has been changed by hand.
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  git pull --ff-only >/dev/null 2>&1
fi
if [ ! -d node_modules ]; then
  npm ci --silent
fi
exec npm run hub
