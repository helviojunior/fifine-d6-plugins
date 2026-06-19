/**
 * HWiNFO gauge item: GPU temperature.
 * Real °C from the privileged helper when available; otherwise the no-sudo
 * thermal-level proxy (machdep.xcpm.gpu_thermal_level, 0-100).
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createGaugeItem } = require("./gauge");
const { read } = require("./sensors");
const exec = promisify(execFile);

async function collect() {
  const t = read().gpuTempC;
  if (t != null) return { value: Math.min(100, t), display: t.toFixed(0) + "°", unit: "°C", label: "GPU TEMP" };
  // No no-sudo GPU thermal proxy on Windows — needs the sensor helper.
  if (process.platform === "win32") return { value: 0, display: "n/a", unit: "", label: "GPU TEMP" };
  let v = 0;
  try { const { stdout } = await exec("sysctl", ["-n", "machdep.xcpm.gpu_thermal_level"]); v = parseInt(stdout.trim()) || 0; } catch {}
  return { value: v, display: String(Math.round(v)), unit: "therm", label: "GPU TEMP" };
}
module.exports = createGaugeItem({ intervalMs: 2000, collect });
