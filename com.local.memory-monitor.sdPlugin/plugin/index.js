/**
 * Memory Monitor — StreamDock plugin (Fifine AmpliGame D6 & compatible).
 *
 * Shows used/total RAM, swap usage, and memory pressure on an LCD key as a PNG.
 * Data via built-in macOS tools: vm_stat, sysctl, memory_pressure.
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const { StreamDock } = require("./streamdock");
const { makeCanvas, text, rect, pngDataUri } = require("./canvas");

process.on("uncaughtException", (e) => console.error("uncaught:", e));
process.on("unhandledRejection", (e) => console.error("unhandled:", e));

const exec = promisify(execFile);
const POLL_MS = 3000;

async function getMemoryInfo() {
  const [vmStatResult, memsizeResult, swapResult, pressureResult, pageSizeResult] = await Promise.all([
    exec("vm_stat"),
    exec("sysctl", ["-n", "hw.memsize"]),
    exec("sysctl", ["vm.swapusage"]),
    exec("memory_pressure", ["-Q"]),
    exec("sysctl", ["-n", "hw.pagesize"]),
  ]);

  const totalBytes = parseInt(memsizeResult.stdout.trim());
  const totalGB = totalBytes / 1024 ** 3;

  // page size varies by architecture (16KB on ARM64, 4KB on x86_64)
  const pageSize = parseInt(pageSizeResult.stdout.trim()) || 16384;
  const pages = (key) => {
    const match = vmStatResult.stdout.match(new RegExp(`${key}:\\s+(\\d+)`));
    return match ? parseInt(match[1]) : 0;
  };

  const anonymous = pages("Anonymous pages");
  const purgeable = pages("Pages purgeable");
  const wired = pages("Pages wired down");
  const compressorOccupied = pages("Pages occupied by compressor");

  // Match Activity Monitor: Used = App Memory + Wired + Compressed
  const appMemBytes = Math.max(0, anonymous - purgeable) * pageSize;
  const wiredBytes = wired * pageSize;
  const compressedBytes = compressorOccupied * pageSize;
  const usedBytes = appMemBytes + wiredBytes + compressedBytes;
  const usedGB = usedBytes / 1024 ** 3;
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

// --- PNG rendering ---

const W = 144;
const H = 144;

function fmt(gb) {
  if (gb >= 10) return `${gb.toFixed(0)}G`;
  if (gb >= 1) return `${gb.toFixed(1)}G`;
  return `${(gb * 1024).toFixed(0)}M`;
}

function pressureColor(pressure) {
  if (pressure === "critical") return "#E57373";
  if (pressure === "warn") return "#FFA726";
  return "#4CAF50";
}

function barColor(pct) {
  if (pct < 0.6) return "#4CAF50";
  if (pct < 0.8) return "#FFA726";
  return "#E57373";
}

async function renderMemoryImage(info) {
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

  // Pressure dot + RAM header
  rect(ctx, 14, 13, 9, 9, pc);
  text(ctx, "RAM", 30, 22, 9, "#aaaaaa", "left", "DeckBold");
  text(ctx, `${fmt(info.usedGB)} / ${fmt(info.totalGB)}`, 132, 22, 8, "#cccccc", "right");

  // RAM bar
  rect(ctx, barX, 30, barW, barH, "#333333");
  if (ramFillW > 0) rect(ctx, barX, 30, ramFillW, barH, ramColor);

  // Swap header
  text(ctx, "SWAP", 12, 64, 9, "#aaaaaa", "left", "DeckBold");
  text(ctx, `${fmt(info.swapUsedGB)}${info.swapTotalGB > 0 ? ` / ${fmt(info.swapTotalGB)}` : ""}`, 132, 64, 8, "#cccccc", "right");

  // Swap bar
  rect(ctx, barX, 72, barW, barH, "#333333");
  if (swapFillW > 0) rect(ctx, barX, 72, swapFillW, barH, swapColor);

  // Free RAM
  text(ctx, `${fmt(info.freeGB)} free`, 72, 108, 10, pc, "center", "DeckBold");

  // Pressure label
  const label = info.pressure === "nominal" ? "Normal" : info.pressure === "warn" ? "Pressure" : "Critical";
  text(ctx, `${label}  ·  ${info.freePercent}%`, 72, 126, 7, "#666666", "center");

  return pngDataUri(img);
}

// --- Plugin ---

const sd = new StreamDock();
const instances = new Map();

async function update(context) {
  try {
    const info = await getMemoryInfo();
    sd.setImage(context, await renderMemoryImage(info));
    sd.setTitle(context, "");
  } catch (err) {
    console.error("Memory update failed:", err.message);
  }
}

sd.on("willAppear", (msg) => {
  const context = msg.context;
  if (instances.has(context)) return;
  const state = { timer: null };
  instances.set(context, state);
  update(context);
  state.timer = setInterval(() => update(context), POLL_MS);
});

sd.on("willDisappear", (msg) => {
  const state = instances.get(msg.context);
  if (state && state.timer) clearInterval(state.timer);
  instances.delete(msg.context);
});

sd.on("keyDown", (msg) => update(msg.context));

sd.connect();
