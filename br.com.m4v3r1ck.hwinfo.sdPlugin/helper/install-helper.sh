#!/bin/bash
# Installs the privileged HWiNFO sensor daemon (real CPU/GPU °C, fan RPM, CPU
# power/clock). Requires sudo — it loads a LaunchDaemon that runs powermetrics
# as root and writes /tmp/hwinfo-sensors.json (world-readable).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
DST="/Library/Application Support/HWiNFO"
PLIST="/Library/LaunchDaemons/br.com.m4v3r1ck.hwinfo.sensors.plist"
if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo:  sudo \"$0\""; exit 1; fi
mkdir -p "$DST"
install -m 755 "$HERE/sensors-daemon.sh" "$DST/sensors-daemon.sh"
install -m 644 "$HERE/br.com.m4v3r1ck.hwinfo.sensors.plist" "$PLIST"
launchctl bootout system "$PLIST" 2>/dev/null || true
launchctl bootstrap system "$PLIST"
launchctl enable system/br.com.m4v3r1ck.hwinfo.sensors 2>/dev/null || true
echo "Installed. Real sensors appear in /tmp/hwinfo-sensors.json within ~3s."
