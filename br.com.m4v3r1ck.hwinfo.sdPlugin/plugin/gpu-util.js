/** HWiNFO gauge item: GPU utilization (%). macOS: ioreg. Windows: winmetrics. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createGaugeItem } = require("./gauge");
const exec = promisify(execFile);

async function collect() {
  let v = 0;
  if (process.platform === "win32") {
    v = (await require("./winmetrics").snapshot()).gpuUtil || 0;
  } else {
    const { stdout } = await exec("ioreg", ["-r", "-c", "IOAccelerator", "-l"]);
    const g = (k) => {
      const m = stdout.match(new RegExp(`"${k}"=(\\d+)`));
      return m ? parseInt(m[1]) : 0;
    };
    v = Math.max(g("Device Utilization %"), g("Renderer Utilization %"), g("Tiler Utilization %"));
  }
  return { value: v, display: String(v), unit: "%", label: "GPU LOAD" };
}
module.exports = createGaugeItem({ intervalMs: 2000, collect });
