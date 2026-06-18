#!/bin/bash
# HWiNFO sensor daemon — runs as root via LaunchDaemon. Samples `powermetrics`
# and publishes CPU/GPU die temperature (°C), CPU package power (W), CPU clock
# (MHz) and fan RPM to a world-readable JSON the plugin reads.
OUT="/tmp/hwinfo-sensors.json"
INTERVAL="${HWINFO_INTERVAL:-2}"
PM=/usr/bin/powermetrics
while true; do
  S="$("$PM" --samplers cpu_power,smc -n1 -i 700 2>/dev/null)"
  cpuTemp=$(awk -F'[: ]+' '/CPU die temperature/{print $4; exit}' <<<"$S")
  gpuTemp=$(awk -F'[: ]+' '/GPU die temperature/{print $4; exit}' <<<"$S")
  pwr=$(grep -i "package power" <<<"$S" | grep -oE '[0-9.]+W' | head -1 | tr -d 'W')
  clk=$(grep -i "System Average frequency" <<<"$S" | grep -oE '\([0-9.]+ Mhz\)' | head -1 | grep -oE '[0-9.]+')
  fan=$(grep -iE '^Fan' <<<"$S" | grep -oE '[0-9.]+' | head -1)
  ts=$(date +%s)
  tmp="$(mktemp /tmp/hwinfo.XXXXXX)"
  printf '{"ts":%s,"cpuTempC":%s,"gpuTempC":%s,"cpuPowerW":%s,"cpuClockMHz":%s,"fanRpm":%s}\n' \
    "$ts" "${cpuTemp:-null}" "${gpuTemp:-null}" "${pwr:-null}" "${clk:-null}" "${fan:-null}" > "$tmp"
  mv -f "$tmp" "$OUT"; chmod 644 "$OUT"
  sleep "$INTERVAL"
done
