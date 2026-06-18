/** HWiNFO gauge item: GPU utilization (%). macOS: ioreg IOAccelerator. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createGaugeItem } = require("./gauge");
const exec = promisify(execFile);

async function collect() {
  const { stdout } = await exec("ioreg", ["-r", "-c", "IOAccelerator", "-l"]);
  const g = (k) => {
    const m = stdout.match(new RegExp(`"${k}"=(\\d+)`));
    return m ? parseInt(m[1]) : 0;
  };
  const v = Math.max(g("Device Utilization %"), g("Renderer Utilization %"), g("Tiler Utilization %"));
  return { value: v, display: String(v), unit: "%", label: "GPU LOAD" };
}
module.exports = createGaugeItem({ intervalMs: 2000, collect });
