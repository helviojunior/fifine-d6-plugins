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

echo "Stopping StreamDock (fifine Control Deck)..."
pkill -f "fifine Control Deck" 2>/dev/null || true
pkill -x "StreamDock" 2>/dev/null || true
sleep 2

for src in "${plugins[@]}"; do
  name="$(basename "$src")"
  echo "  -> $name"
  rm -rf "$DEST/$name"
  cp -R "$src" "$DEST/$name"
  # Optional per-plugin post-install step (e.g. wiring a Claude Code hook).
  # NOT run automatically — it may modify ~/.claude/settings.json. Opt in:
  if [ -x "$DEST/$name/postinstall.sh" ]; then
    echo "     ↳ optional setup available — run: \"$DEST/$name/postinstall.sh\""
  fi
done

# Best-effort cache clear so new icons/actions are picked up.
CACHE="$HOME/Library/Application Support/HotSpot/StreamDock/cache"
if [ -d "$CACHE" ]; then
  rm -rf "${CACHE:?}/"* 2>/dev/null || true
fi

echo "Starting StreamDock..."
open -a "fifine Control Deck" 2>/dev/null \
  || open -a "StreamDock" 2>/dev/null \
  || echo "Could not auto-launch StreamDock — please start it manually."

echo ""
echo "Done. The new actions should appear in the StreamDock action list."
