/**
 * HWiNFO gauge item: GPU thermal level (0-100).
 * sysctl machdep.xcpm.gpu_thermal_level (no °C without sudo/SMC).
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createGaugeItem } = require("./gauge");
const exec = promisify(execFile);

async function collect() {
  let v = 0;
  try {
    const { stdout } = await exec("sysctl", ["-n", "machdep.xcpm.gpu_thermal_level"]);
    v = Math.max(0, Math.min(100, parseInt(stdout.trim()) || 0));
  } catch {
    /* leave 0 */
  }
  return { value: v, display: String(Math.round(v)), unit: "therm", label: "GPU TEMP" };
}
module.exports = createGaugeItem({ intervalMs: 3000, collect });
