/** HWiNFO gauge item: CPU utilization (%). macOS: top. Windows: winmetrics. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createGaugeItem } = require("./gauge");
const exec = promisify(execFile);

async function collect() {
  let v = 0;
  if (process.platform === "win32") {
    v = (await require("./winmetrics").snapshot()).cpuLoad || 0;
  } else {
    const { stdout } = await exec("top", ["-l1", "-s0", "-n0"]);
    const m = stdout.match(/CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys/);
    v = m ? Math.min(100, parseFloat(m[1]) + parseFloat(m[2])) : 0;
  }
  return { value: v, display: v.toFixed(0), unit: "%", label: "CPU LOAD" };
}
module.exports = createGaugeItem({ intervalMs: 2000, collect });
