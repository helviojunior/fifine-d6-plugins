/** History tile: GPU temperature. Real °C from helper, else thermal-level proxy. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createHistoryItem } = require("./history");
const { read } = require("./sensors");
const exec = promisify(execFile);

async function collect() {
  const t = read().gpuTempC;
  if (t != null) return { value: t, display: t.toFixed(0) + " °C" };
  let v = 0;
  try { const { stdout } = await exec("sysctl", ["-n", "machdep.xcpm.gpu_thermal_level"]); v = parseInt(stdout.trim()) || 0; } catch {}
  return { value: v, display: v + " lvl" };
}
module.exports = createHistoryItem({ intervalMs: 3000, title: "GPU Temp", color: "#E5533D", collect });
