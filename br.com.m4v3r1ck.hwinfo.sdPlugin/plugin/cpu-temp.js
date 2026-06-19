/**
 * HWiNFO gauge item: CPU temperature.
 * Real °C from the privileged helper when available; otherwise the no-sudo
 * thermal-level proxy (machdep.xcpm.cpu_thermal_level, 0-100).
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createGaugeItem } = require("./gauge");
const { read } = require("./sensors");
const exec = promisify(execFile);

async function collect() {
  const t = read().cpuTempC;
  if (t != null) return { value: Math.min(100, t), display: t.toFixed(0) + "°", unit: "°C", label: "CPU TEMP" };
  if (process.platform === "win32") {
    // No helper: try the ACPI thermal zone (best effort; many boards lack it).
    const c = (await require("./winmetrics").snapshot()).cpuTempC;
    if (c != null) return { value: Math.min(100, c), display: c.toFixed(0) + "°", unit: "°C", label: "CPU TEMP" };
    return { value: 0, display: "n/a", unit: "", label: "CPU TEMP" };
  }
  let v = 0;
  try { const { stdout } = await exec("sysctl", ["-n", "machdep.xcpm.cpu_thermal_level"]); v = parseInt(stdout.trim()) || 0; } catch {}
  return { value: v, display: String(Math.round(v)), unit: "therm", label: "CPU TEMP" };
}
module.exports = createGaugeItem({ intervalMs: 2000, collect });
