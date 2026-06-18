#!/usr/bin/env bash
#
# install.sh — Install the built StreamDock plugins onto the Fifine host.
#
# Copies every *.sdPlugin folder sitting next to this script into the StreamDock
# (HotSpot) plugins directory, then restarts the StreamDock software.
#
# This file is shipped inside ./build by build.sh, so run it from there:
#     cd build && ./install.sh
#
set -euo pipefail

DEST="$HOME/Library/Application Support/HotSpot/StreamDock/plugins"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

shopt -s nullglob
plugins=("$HERE"/*.sdPlugin)
if [ ${#plugins[@]} -eq 0 ]; then
  echo "No *.sdPlugin folders found next to this script." >&2
  echo "Run ./build.sh first, then run ./build/install.sh." >&2
  exit 1
fi

echo "Installing ${#plugins[@]} plugin(s) into:"
echo "  $DEST"
mkdir -p "$DEST"

echo "Stopping StreamDock..."
pkill -x "StreamDock" 2>/dev/null || true
pkill -f "StreamDock.app" 2>/dev/null || true
sleep 2

for src in "${plugins[@]}"; do
  name="$(basename "$src")"
  echo "  -> $name"
  rm -rf "$DEST/$name"
  cp -R "$src" "$DEST/$name"
done

# Best-effort cache clear so new icons/actions are picked up.
CACHE="$HOME/Library/Application Support/HotSpot/StreamDock/cache"
if [ -d "$CACHE" ]; then
  rm -rf "${CACHE:?}/"* 2>/dev/null || true
fi

echo "Starting StreamDock..."
open -a "StreamDock" 2>/dev/null \
  || open -a "Fifine" 2>/dev/null \
  || echo "Could not auto-launch StreamDock — please start it manually."

echo ""
echo "Done. The new actions should appear in the StreamDock action list."
