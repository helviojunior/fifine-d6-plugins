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

echo "==> Cleaning $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

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

  if [ -f "$dest/plugin/package.json" ]; then
    echo "    install deps + syntax check (docker)"
    docker run --rm \
      -v "$dest/plugin":/app \
      -w /app \
      "$NODE_IMAGE" \
      bash -c "npm install --omit=dev --no-audit --no-fund --loglevel=error && node --check index.js && echo '    ok: index.js'"
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
