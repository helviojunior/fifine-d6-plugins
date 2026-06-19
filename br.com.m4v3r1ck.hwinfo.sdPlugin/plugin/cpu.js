/**
 * HWiNFO item: CPU / GPU usage.
 *
 * Self-contained item module — manages its own per-context poll timers and
 * exposes the {appear, disappear, keyDown} lifecycle the dispatcher calls.
 * Data sources: macOS uses top + ioreg; Windows uses the shared winmetrics
 * PowerShell snapshot (process.platform === "win32").
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const { makeCanvas, text, rect, pngDataUri } = require("./canvas");

const exec = promisify(execFile);
const POLL_MS = 3000;
const timers = new Map();

async function getInfo() {
  if (process.platform === "win32") {
    const m = await require("./winmetrics").snapshot();
    return {
      cpuUser: m.cpuUser,
      cpuSys: m.cpuSys,
      cpuTotal: Math.min(100, m.cpuUser + m.cpuSys),
      gpuDevice: m.gpuUtil,
      gpuRenderer: m.gpuUtil,
      gpuTiler: 0,
    };
  }
  const [topResult, ioregResult] = await Promise.all([
    exec("top", ["-l1", "-s0", "-n0"]),
    exec("ioreg", ["-r", "-c", "IOAccelerator", "-l"]),
  ]);

  const cpuMatch = topResult.stdout.match(
    /CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys,\s+([\d.]+)%\s+idle/
  );
  const cpuUser = cpuMatch ? parseFloat(cpuMatch[1]) : 0;
  const cpuSys = cpuMatch ? parseFloat(cpuMatch[2]) : 0;
  const cpuTotal = cpuUser + cpuSys;

  const gpuParse = (key) => {
    const m = ioregResult.stdout.match(new RegExp(`"${key}"=(\\d+)`));
    return m ? parseInt(m[1]) : 0;
  };
  const gpuDevice = gpuParse("Device Utilization %");
  const gpuRenderer = gpuParse("Renderer Utilization %");
  const gpuTiler = gpuParse("Tiler Utilization %");

  return { cpuUser, cpuSys, cpuTotal, gpuDevice, gpuRenderer, gpuTiler };
}

const W = 144;
const H = 144;

function usageColor(pct) {
  if (pct < 50) return "#4CAF50";
  if (pct < 80) return "#FFA726";
  return "#E57373";
}

async function render(info) {
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

  rect(ctx, 0, 0, W, H, "#1a1a2e");

  rect(ctx, 14, 13, 9, 9, cpuColor);
  text(ctx, "CPU", 30, 22, 9, "#aaaaaa", "left", "DeckBold");
  text(ctx, cpuPct.toFixed(0) + "%", 132, 23, 10, cpuColor, "right", "DeckBold");

  rect(ctx, barX, 30, barW, barH, "#333333");
  if (userW > 0) rect(ctx, barX, 30, userW, barH, "#4FC3F7");
  if (sysW > 0) rect(ctx, barX + userW, 30, sysW, barH, "#FF8A65");

  rect(ctx, 14, 52, 8, 8, "#4FC3F7");
  text(ctx, "User " + info.cpuUser.toFixed(0) + "%", 26, 59, 7, "#999999");
  rect(ctx, 76, 52, 8, 8, "#FF8A65");
  text(ctx, "Sys " + info.cpuSys.toFixed(0) + "%", 88, 59, 7, "#999999");

  rect(ctx, 14, 75, 9, 9, gpuColor);
  text(ctx, "GPU", 30, 84, 9, "#aaaaaa", "left", "DeckBold");
  text(ctx, gpuPct + "%", 132, 85, 10, gpuColor, "right", "DeckBold");

  rect(ctx, barX, 92, barW, barH, "#333333");
  if (gpuFillW > 0) rect(ctx, barX, 92, gpuFillW, barH, gpuColor);

  text(ctx, "Render " + info.gpuRenderer + "%", 16, 122, 7, "#666666");
  text(ctx, "Tiler " + info.gpuTiler + "%", 84, 122, 7, "#666666");

  return pngDataUri(img);
}

async function update(ctx, sd) {
  try {
    sd.setImage(ctx, await render(await getInfo()));
    sd.setTitle(ctx, "");
  } catch (e) {
    console.error("cpu:", e.message);
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
