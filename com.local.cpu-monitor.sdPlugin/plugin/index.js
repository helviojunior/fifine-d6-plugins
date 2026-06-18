/**
 * CPU/GPU Monitor — StreamDock plugin (Fifine AmpliGame D6 & compatible).
 *
 * Renders a real-time bar chart of CPU usage (user/system) and GPU utilization
 * on an LCD key as a PNG (the device renders PNG via setImage, not SVG).
 *
 * Data sources (all built into macOS):
 *   - `top -l1`                       → CPU user/sys/idle
 *   - `ioreg -r -c IOAccelerator -l`  → GPU PerformanceStatistics
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const { StreamDock } = require("./streamdock");
const { makeCanvas, text, rect, pngDataUri } = require("./canvas");

process.on("uncaughtException", (e) => console.error("uncaught:", e));
process.on("unhandledRejection", (e) => console.error("unhandled:", e));

const exec = promisify(execFile);
const POLL_MS = 3000;

async function getCpuGpuInfo() {
  const [topResult, ioregResult] = await Promise.all([
    exec("top", ["-l1", "-s0", "-n0"]),
    exec("ioreg", ["-r", "-c", "IOAccelerator", "-l"]),
  ]);

  // Parse CPU from top
  const cpuMatch = topResult.stdout.match(
    /CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys,\s+([\d.]+)%\s+idle/
  );
  const cpuUser = cpuMatch ? parseFloat(cpuMatch[1]) : 0;
  const cpuSys = cpuMatch ? parseFloat(cpuMatch[2]) : 0;
  const cpuIdle = cpuMatch ? parseFloat(cpuMatch[3]) : 0;
  const cpuTotal = cpuUser + cpuSys;

  // Parse GPU from ioreg PerformanceStatistics
  const gpuParse = (key) => {
    const match = ioregResult.stdout.match(new RegExp(`"${key}"=(\\d+)`));
    return match ? parseInt(match[1]) : 0;
  };
  const gpuDevice = gpuParse("Device Utilization %");
  const gpuRenderer = gpuParse("Renderer Utilization %");
  const gpuTiler = gpuParse("Tiler Utilization %");

  return { cpuUser, cpuSys, cpuIdle, cpuTotal, gpuDevice, gpuRenderer, gpuTiler };
}

// --- PNG rendering ---

const W = 144;
const H = 144;

function usageColor(pct) {
  if (pct < 50) return "#4CAF50";
  if (pct < 80) return "#FFA726";
  return "#E57373";
}

async function renderImage(info) {
  const { img, ctx } = makeCanvas(W, H);

  const barX = 12;
  const barW = 120;
  const barH = 14;

  const cpuPct = Math.min(100, info.cpuTotal);
  const cpuColor = usageColor(cpuPct);
  const userW = Math.round((barW * Math.min(100, info.cpuUser)) / 100);
  const sysW = Math.round((barW * Math.min(100, info.cpuSys)) / 100);

  const gpuPct = Math.max(info.gpuDevice, info.gpuRenderer, info.gpuTiler);
  const gpuColor = usageColor(gpuPct);
  const gpuFillW = Math.round((barW * gpuPct) / 100);

  // background
  rect(ctx, 0, 0, W, H, "#1a1a2e");

  // CPU header
  rect(ctx, 14, 13, 9, 9, cpuColor);
  text(ctx, "CPU", 30, 22, 9, "#aaaaaa", "left", "DeckBold");
  text(ctx, cpuPct.toFixed(0) + "%", 132, 23, 10, cpuColor, "right", "DeckBold");

  // CPU bar (stacked: user + sys)
  rect(ctx, barX, 30, barW, barH, "#333333");
  if (userW > 0) rect(ctx, barX, 30, userW, barH, "#4FC3F7");
  if (sysW > 0) rect(ctx, barX + userW, 30, sysW, barH, "#FF8A65");

  // CPU breakdown
  rect(ctx, 14, 52, 8, 8, "#4FC3F7");
  text(ctx, "User " + info.cpuUser.toFixed(0) + "%", 26, 59, 7, "#999999");
  rect(ctx, 76, 52, 8, 8, "#FF8A65");
  text(ctx, "Sys " + info.cpuSys.toFixed(0) + "%", 88, 59, 7, "#999999");

  // GPU header
  rect(ctx, 14, 75, 9, 9, gpuColor);
  text(ctx, "GPU", 30, 84, 9, "#aaaaaa", "left", "DeckBold");
  text(ctx, gpuPct + "%", 132, 85, 10, gpuColor, "right", "DeckBold");

  // GPU bar
  rect(ctx, barX, 92, barW, barH, "#333333");
  if (gpuFillW > 0) rect(ctx, barX, 92, gpuFillW, barH, gpuColor);

  // GPU breakdown
  text(ctx, "Render " + info.gpuRenderer + "%", 16, 122, 7, "#666666");
  text(ctx, "Tiler " + info.gpuTiler + "%", 84, 122, 7, "#666666");

  return pngDataUri(img);
}

// --- Plugin ---

const sd = new StreamDock();
const instances = new Map(); // context -> { timer }

async function update(context) {
  try {
    const info = await getCpuGpuInfo();
    sd.setImage(context, await renderImage(info));
    sd.setTitle(context, "");
  } catch (err) {
    console.error("CPU/GPU update failed:", err.message);
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

// Press to force an immediate refresh.
sd.on("keyDown", (msg) => update(msg.context));

sd.connect();
