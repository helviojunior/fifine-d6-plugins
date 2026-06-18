/**
 * HWiNFO item: RAM / swap / memory pressure.
 *
 * Self-contained item module ({appear, disappear, keyDown}). macOS-only data
 * for now (vm_stat / sysctl / memory_pressure); add a Windows branch in
 * getInfo() later.
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const { makeCanvas, text, rect, pngDataUri } = require("./canvas");

const exec = promisify(execFile);
const POLL_MS = 3000;
const timers = new Map();

async function getInfo() {
  const [vmStatResult, memsizeResult, swapResult, pressureResult, pageSizeResult] = await Promise.all([
    exec("vm_stat"),
    exec("sysctl", ["-n", "hw.memsize"]),
    exec("sysctl", ["vm.swapusage"]),
    exec("memory_pressure", ["-Q"]),
    exec("sysctl", ["-n", "hw.pagesize"]),
  ]);

  const totalGB = parseInt(memsizeResult.stdout.trim()) / 1024 ** 3;
  const pageSize = parseInt(pageSizeResult.stdout.trim()) || 16384;
  const pages = (key) => {
    const m = vmStatResult.stdout.match(new RegExp(`${key}:\\s+(\\d+)`));
    return m ? parseInt(m[1]) : 0;
  };

  const appMemBytes = Math.max(0, pages("Anonymous pages") - pages("Pages purgeable")) * pageSize;
  const wiredBytes = pages("Pages wired down") * pageSize;
  const compressedBytes = pages("Pages occupied by compressor") * pageSize;
  const usedGB = (appMemBytes + wiredBytes + compressedBytes) / 1024 ** 3;
  const freeGB = totalGB - usedGB;

  const swapMatch = swapResult.stdout.match(/total = ([\d.]+)M\s+used = ([\d.]+)M/);
  const swapTotalGB = swapMatch ? parseFloat(swapMatch[1]) / 1024 : 0;
  const swapUsedGB = swapMatch ? parseFloat(swapMatch[2]) / 1024 : 0;

  const freePercentMatch = pressureResult.stdout.match(/free percentage:\s+(\d+)%/);
  const freePercent = freePercentMatch ? parseInt(freePercentMatch[1]) : 50;
  let pressure = "nominal";
  if (freePercent < 20) pressure = "critical";
  else if (freePercent < 40) pressure = "warn";

  return { totalGB, usedGB, freeGB, swapUsedGB, swapTotalGB, pressure, freePercent };
}

const W = 144;
const H = 144;

function fmt(gb) {
  if (gb >= 10) return `${gb.toFixed(0)}G`;
  if (gb >= 1) return `${gb.toFixed(1)}G`;
  return `${(gb * 1024).toFixed(0)}M`;
}
function pressureColor(p) {
  if (p === "critical") return "#E57373";
  if (p === "warn") return "#FFA726";
  return "#4CAF50";
}
function barColor(pct) {
  if (pct < 0.6) return "#4CAF50";
  if (pct < 0.8) return "#FFA726";
  return "#E57373";
}

async function render(info) {
  const { img, ctx } = makeCanvas(W, H);
  const ramPct = Math.min(1, info.usedGB / info.totalGB);
  const swapPct = info.swapTotalGB > 0 ? Math.min(1, info.swapUsedGB / info.swapTotalGB) : 0;
  const pc = pressureColor(info.pressure);
  const ramColor = barColor(ramPct);
  const swapColor = info.swapUsedGB > 0.1 ? barColor(swapPct) : "#555555";

  const barX = 12;
  const barW = 120;
  const barH = 14;
  const ramFillW = Math.round(barW * ramPct);
  const swapFillW = Math.round(barW * swapPct);

  rect(ctx, 0, 0, W, H, "#1a1a2e");

  rect(ctx, 14, 13, 9, 9, pc);
  text(ctx, "RAM", 30, 22, 9, "#aaaaaa", "left", "DeckBold");
  text(ctx, `${fmt(info.usedGB)} / ${fmt(info.totalGB)}`, 132, 22, 8, "#cccccc", "right");

  rect(ctx, barX, 30, barW, barH, "#333333");
  if (ramFillW > 0) rect(ctx, barX, 30, ramFillW, barH, ramColor);

  text(ctx, "SWAP", 12, 64, 9, "#aaaaaa", "left", "DeckBold");
  text(ctx, `${fmt(info.swapUsedGB)}${info.swapTotalGB > 0 ? ` / ${fmt(info.swapTotalGB)}` : ""}`, 132, 64, 8, "#cccccc", "right");

  rect(ctx, barX, 72, barW, barH, "#333333");
  if (swapFillW > 0) rect(ctx, barX, 72, swapFillW, barH, swapColor);

  text(ctx, `${fmt(info.freeGB)} free`, 72, 108, 10, pc, "center", "DeckBold");
  const label = info.pressure === "nominal" ? "Normal" : info.pressure === "warn" ? "Pressure" : "Critical";
  text(ctx, `${label}  ·  ${info.freePercent}%`, 72, 126, 7, "#666666", "center");

  return pngDataUri(img);
}

async function update(ctx, sd) {
  try {
    sd.setImage(ctx, await render(await getInfo()));
    sd.setTitle(ctx, "");
  } catch (e) {
    console.error("memory:", e.message);
  }
}

module.exports = {
  appear(ctx, sd) {
    if (timers.has(ctx)) return;
    update(ctx, sd);
    timers.set(ctx, setInterval(() => update(ctx, sd), POLL_MS));
  },
  disappear(ctx) {
    const t = timers.get(ctx);
    if (t) clearInterval(t);
    timers.delete(ctx);
  },
  keyDown(ctx, sd) {
    update(ctx, sd);
  },
  getInfo,
  render,
};
