#!/usr/bin/env bash
#
# build.sh — Build every StreamDock plugin in this repo using Docker.
#
# For each top-level *.sdPlugin directory it:
#   1. copies the plugin into ./build/<name>.sdPlugin (minus any node_modules)
#   2. vendors its npm dependencies (the `ws` client) via a node:20 container
#   3. syntax-checks the plugin entry point
#
# Finally it drops install.sh next to the built plugins so the whole ./build
# folder is self-contained and ready to install on the Fifine / StreamDock host.
#
# No Node.js is required on the host — only Docker.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT/build"
NODE_IMAGE="${NODE_IMAGE:-node:20-bookworm}"
# Image used to cross-compile the Windows CodePathWin launcher (tools/launcher.c).
MINGW_IMAGE="${MINGW_IMAGE:-debian:bookworm-slim}"

echo "==> Cleaning $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Cross-compile the Windows launcher once (shared by every node plugin). On
# Windows the StreamDock host runs CodePathWin as a native process and will NOT
# execute a .js directly, so each node plugin ships this tiny launch.exe (the
# Windows counterpart of the macOS `run` wrapper) which execs index.js.
LAUNCHER_EXE=""
if [ -f "$ROOT/tools/launcher.c" ]; then
  echo "==> Cross-compiling Windows launcher via Docker ($MINGW_IMAGE)"
  docker run --rm -v "$ROOT/tools":/work -w /work "$MINGW_IMAGE" bash -c "
    set -e
    apt-get update -qq >/dev/null 2>&1
    apt-get install -y -qq gcc-mingw-w64-x86-64 >/dev/null 2>&1
    x86_64-w64-mingw32-gcc -O2 -s -mwindows launcher.c -o launch.exe"
  LAUNCHER_EXE="$ROOT/tools/launch.exe"
  echo "    built $LAUNCHER_EXE"
fi

shopt -s nullglob
plugins=("$ROOT"/*.sdPlugin)
if [ ${#plugins[@]} -eq 0 ]; then
  echo "No *.sdPlugin directories found in $ROOT" >&2
  exit 1
fi

echo "==> Found ${#plugins[@]} plugin(s); using Docker image $NODE_IMAGE"

for src in "${plugins[@]}"; do
  name="$(basename "$src")"
  dest="$BUILD_DIR/$name"
  echo ""
  echo "==> $name"

  # Copy plugin sources into the build dir, dropping any stale node_modules.
  rsync -a --exclude 'node_modules' "$src/" "$dest/"

  # Ensure the macOS CodePath launcher stays executable (host execs it directly).
  mac_codepath="$(python3 -c "import json,sys; print(json.load(open('$dest/manifest.json')).get('CodePathMac',''))" 2>/dev/null || true)"
  if [ -n "$mac_codepath" ] && [ -f "$dest/$mac_codepath" ]; then
    chmod +x "$dest/$mac_codepath"
    echo "    chmod +x $mac_codepath"
  fi

  if [ -f "$dest/plugin/package.json" ]; then
    echo "    install deps + syntax check (docker)"
    docker run --rm \
      -v "$dest/plugin":/app \
      -w /app \
      "$NODE_IMAGE" \
      bash -c "npm install --omit=dev --no-audit --no-fund --loglevel=error && node --check index.js && echo '    ok: index.js'"
    # Ship the Windows launcher next to index.js (CodePathWin points at it).
    if [ -n "$LAUNCHER_EXE" ] && [ -f "$LAUNCHER_EXE" ]; then
      cp "$LAUNCHER_EXE" "$dest/plugin/launch.exe"
      echo "    + launch.exe (Windows CodePathWin launcher)"
    fi
  else
    echo "    no plugin/package.json — nothing to install"
  fi
done

# Ship the installer alongside the built plugins.
cp "$ROOT/install.sh" "$BUILD_DIR/install.sh"
chmod +x "$BUILD_DIR/install.sh"

echo ""
echo "==> Done. Built ${#plugins[@]} plugin(s) into: $BUILD_DIR"
echo "    Install on the Fifine host with:  cd build && ./install.sh"
