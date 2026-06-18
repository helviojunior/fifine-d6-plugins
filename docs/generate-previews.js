/**
 * Generates a preview PNG for each plugin item into docs/images/.
 *
 * Renders use each plugin's real render functions with representative sample
 * data, so previews look exactly like the device output. Requires the plugins
 * to be built first (so pureimage is vendored):
 *
 *     ./build.sh
 *     "/Applications/fifine Control Deck.app/Contents/Helpers/node20" docs/generate-previews.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HW = path.join(ROOT, "build/br.com.m4v3r1ck.hwinfo.sdPlugin/plugin");
const CL = path.join(ROOT, "build/br.com.m4v3r1ck.claude.sdPlugin/plugin");
const OUT = path.join(__dirname, "images");
fs.mkdirSync(OUT, { recursive: true });

const cpu = require(path.join(HW, "cpu.js"));
const memory = require(path.join(HW, "memory.js"));
const { renderGauge } = require(path.join(HW, "gauge.js"));
const { renderHistory } = require(path.join(HW, "history.js"));
const usage = require(path.join(CL, "usage.js"));
const approve = require(path.join(CL, "approve.js"));

const GREEN = "#4CAF50";
const RED = "#E5533D";

// pleasant deterministic sparkline data
function wave(base, amp, n = 44) {
  return Array.from({ length: n }, (_, i) => Math.max(0, base + Math.sin(i / 4) * amp + Math.sin(i / 2.3) * amp * 0.4));
}

async function save(name, dataUri) {
  fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(dataUri.split(",")[1], "base64"));
  console.log("  ", name);
}

async function main() {
  // --- HWiNFO: bars ---
  await save("cpu-gpu", await cpu.render({ cpuUser: 23, cpuSys: 11, cpuTotal: 34, gpuDevice: 62, gpuRenderer: 62, gpuTiler: 18 }));
  await save("memory", await memory.render({ totalGB: 32, usedGB: 21.4, freeGB: 10.6, swapUsedGB: 1.2, swapTotalGB: 4, pressure: "warn", freePercent: 42 }));

  // --- HWiNFO: gauges ---
  await save("gauge-cpu-load", await renderGauge({ value: 34, display: "34", unit: "%", label: "CPU LOAD" }));
  await save("gauge-gpu-load", await renderGauge({ value: 62, display: "62", unit: "%", label: "GPU LOAD" }));
  await save("gauge-ram-load", await renderGauge({ value: 78, display: "78", unit: "%", label: "RAM LOAD" }));
  await save("gauge-cpu-temp", await renderGauge({ value: 71, display: "71°", unit: "°C", label: "CPU TEMP" }));
  await save("gauge-gpu-temp", await renderGauge({ value: 48, display: "48°", unit: "°C", label: "GPU TEMP" }));
  await save("gauge-fan", await renderGauge({ value: 57, display: "3400", unit: "rpm", label: "FAN" }));

  // --- HWiNFO: history ---
  await save("hist-cpu-usage", await renderHistory({ title: "CPU Usage", value: "34%", hist: wave(30, 18), color: GREEN }));
  await save("hist-gpu-usage", await renderHistory({ title: "GPU Usage", value: "62%", hist: wave(50, 30), color: RED }));
  await save("hist-gpu-clock", await renderHistory({ title: "GPU Clock", value: "1049 MHz", hist: wave(900, 180), color: RED }));
  await save("hist-gpu-mem", await renderHistory({ title: "GPU Mem", value: "2286 MB", hist: wave(2100, 220), color: RED }));
  await save("hist-gpu-temp", await renderHistory({ title: "GPU Temp", value: "48 °C", hist: wave(47, 6), color: RED }));
  await save("hist-cpu-clock", await renderHistory({ title: "CPU Clock", value: "3600 MHz", hist: wave(3200, 500), color: GREEN }));
  await save("hist-cpu-pwr", await renderHistory({ title: "CPU PWR", value: "45 W", hist: wave(38, 18), color: GREEN }));
  await save("hist-cpu-temp", await renderHistory({ title: "CPU Temp", value: "71 °C", hist: wave(66, 10), color: GREEN }));

  // --- Claude ---
  const reset5h = Math.floor(Date.now() / 1000) + 3600 * 2 + 540;
  await save("claude-usage", await usage.render({ status: "allowed", utilization5h: 0.42, reset5h, status5h: "allowed", utilization7d: 0.18, reset7d: 0, status7d: "allowed", representativeClaim: "five_hour" }));
  await save("claude-approve-idle", await approve.renderIdle());
  await save("claude-approve-pending", await approve.renderPending({ tool_name: "Bash", tool_input: { command: "git push origin main", description: "Push to remote" }, timestamp: Math.floor(Date.now() / 1000) - 8, request_id: "x" }, 2));
  await save("claude-approve-approved", await approve.renderApproved());
}

main().then(() => console.log("done -> docs/images/")).catch((e) => { console.error(e); process.exit(1); });
