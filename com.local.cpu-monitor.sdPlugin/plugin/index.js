/**
 * CPU/GPU Monitor — StreamDock plugin (Fifine AmpliGame D6 & compatible).
 *
 * Renders a real-time bar chart of CPU usage (user/system) and GPU utilization
 * on an LCD key. Ported from the Elgato Stream Deck (Node SDK) version to plain
 * Node.js using the StreamDock WebSocket protocol.
 *
 * Data sources (all built into macOS):
 *   - `top -l1`                       → CPU user/sys/idle
 *   - `ioreg -r -c IOAccelerator -l`  → GPU PerformanceStatistics
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const { StreamDock } = require("./streamdock");

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

// --- SVG rendering ---

const W = 144;
const H = 144;

function usageColor(pct) {
  if (pct < 50) return "#4CAF50";
  if (pct < 80) return "#FFA726";
  return "#E57373";
}

function renderImage(info) {
  const barW = 120;
  const barH = 14;
  const barX = 12;
  const barR = 4;

  const cpuPct = Math.min(100, info.cpuTotal);
  const cpuColor = usageColor(cpuPct);

  // Show user vs sys as stacked bar
  const userW = Math.round((barW * Math.min(100, info.cpuUser)) / 100);
  const sysW = Math.round((barW * Math.min(100, info.cpuSys)) / 100);

  const gpuPct = Math.max(info.gpuDevice, info.gpuRenderer, info.gpuTiler);
  const gpuFillW = Math.round((barW * gpuPct) / 100);
  const gpuColor = usageColor(gpuPct);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="28" fill="#1a1a2e"/>

  <!-- CPU header -->
  <circle cx="20" cy="18" r="5" fill="${cpuColor}"/>
  <text x="30" y="22" font-family="-apple-system,Helvetica" font-size="12" font-weight="600" fill="#aaa">CPU</text>
  <text x="132" y="22" font-family="-apple-system,Helvetica" font-size="13" font-weight="700" fill="${cpuColor}" text-anchor="end">${cpuPct.toFixed(0)}%</text>

  <!-- CPU bar (stacked: user=blue-ish, sys=orange-ish) -->
  <defs><clipPath id="cb"><rect x="${barX}" y="30" width="${barW}" height="${barH}" rx="${barR}"/></clipPath></defs>
  <rect x="${barX}" y="30" width="${barW}" height="${barH}" rx="${barR}" fill="#333"/>
  ${userW > 0 ? `<rect x="${barX}" y="30" width="${userW}" height="${barH}" fill="#4FC3F7" clip-path="url(#cb)"/>` : ""}
  ${sysW > 0 ? `<rect x="${barX + userW}" y="30" width="${sysW}" height="${barH}" fill="#FF8A65" clip-path="url(#cb)"/>` : ""}

  <!-- CPU breakdown -->
  <circle cx="18" cy="56" r="4" fill="#4FC3F7"/>
  <text x="26" y="59" font-family="-apple-system,Helvetica" font-size="10" fill="#999">User ${info.cpuUser.toFixed(0)}%</text>
  <circle cx="80" cy="56" r="4" fill="#FF8A65"/>
  <text x="88" y="59" font-family="-apple-system,Helvetica" font-size="10" fill="#999">Sys ${info.cpuSys.toFixed(0)}%</text>

  <!-- GPU header -->
  <circle cx="20" cy="80" r="5" fill="${gpuColor}"/>
  <text x="30" y="84" font-family="-apple-system,Helvetica" font-size="12" font-weight="600" fill="#aaa">GPU</text>
  <text x="132" y="84" font-family="-apple-system,Helvetica" font-size="13" font-weight="700" fill="${gpuColor}" text-anchor="end">${gpuPct}%</text>

  <!-- GPU bar -->
  <defs><clipPath id="gb"><rect x="${barX}" y="92" width="${barW}" height="${barH}" rx="${barR}"/></clipPath></defs>
  <rect x="${barX}" y="92" width="${barW}" height="${barH}" rx="${barR}" fill="#333"/>
  ${gpuFillW > 0 ? `<rect x="${barX}" y="92" width="${gpuFillW}" height="${barH}" fill="${gpuColor}" clip-path="url(#gb)"/>` : ""}

  <!-- GPU breakdown -->
  <text x="16" y="122" font-family="-apple-system,Helvetica" font-size="10" fill="#666">Render ${info.gpuRenderer}%</text>
  <text x="84" y="122" font-family="-apple-system,Helvetica" font-size="10" fill="#666">Tiler ${info.gpuTiler}%</text>
</svg>`;
}

function svgDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// --- Plugin ---

const sd = new StreamDock();
const instances = new Map(); // context -> { timer }

async function update(context) {
  try {
    const info = await getCpuGpuInfo();
    sd.setImage(context, svgDataUri(renderImage(info)));
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
