#!/bin/bash
set -e
PLIST="/Library/LaunchDaemons/br.com.m4v3r1ck.hwinfo.sensors.plist"
if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo:  sudo \"$0\""; exit 1; fi
launchctl bootout system "$PLIST" 2>/dev/null || true
rm -f "$PLIST" "/Library/Application Support/HWiNFO/sensors-daemon.sh" /tmp/hwinfo-sensors.json
echo "Uninstalled HWiNFO sensor daemon."
