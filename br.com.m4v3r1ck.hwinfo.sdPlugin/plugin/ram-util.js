/** HWiNFO gauge item: RAM utilization (%). macOS: vm_stat + sysctl. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createGaugeItem } = require("./gauge");
const exec = promisify(execFile);

async function collect() {
  const [vm, memsize, pagesize] = await Promise.all([
    exec("vm_stat"),
    exec("sysctl", ["-n", "hw.memsize"]),
    exec("sysctl", ["-n", "hw.pagesize"]),
  ]);
  const total = parseInt(memsize.stdout.trim());
  const ps = parseInt(pagesize.stdout.trim()) || 16384;
  const pages = (k) => {
    const m = vm.stdout.match(new RegExp(`${k}:\\s+(\\d+)`));
    return m ? parseInt(m[1]) : 0;
  };
  const used =
    (Math.max(0, pages("Anonymous pages") - pages("Pages purgeable")) +
      pages("Pages wired down") +
      pages("Pages occupied by compressor")) * ps;
  const v = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return { value: v, display: v.toFixed(0), unit: "%", label: "RAM LOAD" };
}
module.exports = createGaugeItem({ intervalMs: 3000, collect });
