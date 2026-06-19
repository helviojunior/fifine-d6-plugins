/**
 * Reads the privileged sensor JSON published by the platform sensor helper:
 *   - macOS:   /tmp/hwinfo-sensors.json          (helper/sensors-daemon.sh)
 *   - Windows: %TEMP%\hwinfo-sensors.json        (helper/sensors-daemon.ps1)
 *
 * Returns {} when the helper isn't installed or the data is stale, so items can
 * gracefully fall back (e.g. to the no-sudo thermal_level proxy).
 *
 * Fields: cpuTempC, gpuTempC, cpuPowerW, cpuClockMHz, fanRpm.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const FILE =
  process.platform === "win32"
    ? path.join(os.tmpdir(), "hwinfo-sensors.json")
    : "/tmp/hwinfo-sensors.json";
const STALE_SEC = 12;

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    if (!j || typeof j !== "object") return {};
    if (j.ts && Date.now() / 1000 - j.ts > STALE_SEC) return {};
    return j;
  } catch {
    return {};
  }
}

/** True when the helper daemon is publishing fresh data. */
function available() {
  return Object.keys(read()).length > 0;
}

module.exports = { read, available };
