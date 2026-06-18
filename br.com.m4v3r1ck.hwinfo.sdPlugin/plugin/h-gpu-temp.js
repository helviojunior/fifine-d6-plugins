/** History tile: GPU thermal level 0-100 (sysctl proxy; real °C needs helper). */
const { execFile } = require("child_process"); const { promisify } = require("util");
const { createHistoryItem } = require("./history"); const exec = promisify(execFile);
async function collect(){
  let v = 0;
  try { const { stdout } = await exec("sysctl", ["-n","machdep.xcpm.gpu_thermal_level"]); v = parseInt(stdout.trim())||0; } catch {}
  return { value: v, display: v+" lvl" };
}
module.exports = createHistoryItem({ intervalMs:3000, title:"GPU Temp", color:"#E5533D", collect });
