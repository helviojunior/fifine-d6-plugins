/**
 * Claude item: rate-limit utilization (5h / 7d).
 *
 * Self-contained item module ({appear, disappear, keyDown}). Reads the Claude
 * Code OAuth token from the macOS Keychain and polls a 1-token API call every
 * 60s for the anthropic-ratelimit-unified-* headers. macOS-only token read for
 * now; a Windows branch can be added in getOAuthToken().
 *
 * First poll may trigger a macOS Keychain permission prompt — click Allow.
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const https = require("https");
const { makeCanvas, text, rect, pngDataUri } = require("./canvas");

const execFileAsync = promisify(execFile);
const POLL_MS = 60_000;
const state = new Map(); // ctx -> { timer, lastInfo }

async function getOAuthToken() {
  const { stdout } = await execFileAsync("security", [
    "find-generic-password", "-s", "Claude Code-credentials", "-w",
  ]);
  const oauth = JSON.parse(stdout.trim()).claudeAiOauth;
  if (Date.now() > oauth.expiresAt) throw new Error("token expired");
  return oauth.accessToken;
}

function apiCall(token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "x" }] });
    const req = https.request(
      {
        hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const headers = {};
          for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v[0] : v;
          try { resolve({ headers }); } catch { reject(new Error("API parse error")); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error("API timeout")); });
    req.write(payload);
    req.end();
  });
}

async function getRateLimits() {
  const token = await getOAuthToken();
  const { headers } = await apiCall(token);
  return {
    status: headers["anthropic-ratelimit-unified-status"] || "unknown",
    utilization5h: parseFloat(headers["anthropic-ratelimit-unified-5h-utilization"] || "0"),
    reset5h: parseInt(headers["anthropic-ratelimit-unified-5h-reset"] || "0", 10),
    status5h: headers["anthropic-ratelimit-unified-5h-status"] || "unknown",
    utilization7d: parseFloat(headers["anthropic-ratelimit-unified-7d-utilization"] || "0"),
    reset7d: parseInt(headers["anthropic-ratelimit-unified-7d-reset"] || "0", 10),
    status7d: headers["anthropic-ratelimit-unified-7d-status"] || "unknown",
    representativeClaim: headers["anthropic-ratelimit-unified-representative-claim"] || "five_hour",
  };
}

function formatClock(epochSec) {
  const d = new Date(epochSec * 1000);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
function formatDuration(ms) {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}m` : `${m}m`;
}
function getPaceStatus(info) {
  if (info.status === "rate_limited" || info.status5h === "rate_limited") return "limited";
  const u = info.utilization5h;
  const remaining = 1 - u;
  const windowFractionLeft = Math.max(0, Math.min(1, (info.reset5h * 1000 - Date.now()) / (5 * 3600_000)));
  if (u <= 0.01) return "idle";
  if (u >= 0.95) return "critical";
  if (windowFractionLeft < 0.1) return u >= 0.9 ? "high" : "low";
  const pace = (1 - windowFractionLeft) > 0.01 ? u / (1 - windowFractionLeft) : 0;
  if (pace >= 1.5 || remaining < 0.1) return "critical";
  if (pace >= 1.0 || remaining < 0.2) return "high";
  if (pace >= 0.7) return "moderate";
  return "low";
}
const COLORS = { idle: "#666666", low: "#4CAF50", moderate: "#FFA726", high: "#FF7043", critical: "#E57373", limited: "#F44336" };
const LABELS = { idle: "IDLE", low: "LOW", moderate: "MED", high: "HIGH", critical: "CRIT", limited: "LIMIT" };
function dim(hex, amt = 0.22) {
  const bg = [26, 26, 46];
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${c.map((v, i) => Math.round(v * amt + bg[i] * (1 - amt)).toString(16).padStart(2, "0")).join("")}`;
}

const W = 144, H = 144;

async function render(info) {
  const { img, ctx } = makeCanvas(W, H);
  const pct5h = Math.min(100, info.utilization5h * 100);
  const pct7d = Math.min(100, info.utilization7d * 100);
  const fill5h = Math.round((112 * pct5h) / 100);
  const fill7d = Math.round((112 * pct7d) / 100);
  const pace = getPaceStatus(info);
  const color = COLORS[pace];
  const label = LABELS[pace];
  const resetIn = formatDuration(info.reset5h * 1000 - Date.now());
  const color7d = info.utilization7d >= 0.7 ? "#FF7043" : info.utilization7d >= 0.4 ? "#FFA726" : "#4CAF50";

  rect(ctx, 0, 0, W, H, "#1a1a2e");
  rect(ctx, 13, 11, 9, 9, "#D4A574");
  text(ctx, "Claude", 28, 20, 8, "#dddddd", "left", "DeckBold");
  const badgeW = label.length * 7 + 10;
  rect(ctx, W - badgeW - 6, 7, badgeW, 17, dim(color));
  text(ctx, label, W - 10, 20, 7, color, "right", "DeckBold");
  text(ctx, pct5h.toFixed(0) + "%", 72, 52, 20, color, "center", "DeckBold");
  text(ctx, "5h window", 72, 64, 7, "#888888", "center");
  rect(ctx, 16, 70, 112, 10, "#333333");
  if (fill5h > 0) rect(ctx, 16, 70, fill5h, 10, color);
  text(ctx, "7d", 16, 96, 7, "#666666");
  text(ctx, pct7d.toFixed(0) + "%", 128, 96, 7, color7d, "right");
  rect(ctx, 16, 100, 112, 8, "#333333");
  if (fill7d > 0) rect(ctx, 16, 100, fill7d, 8, color7d);
  text(ctx, "resets", 16, 124, 7, "#666666");
  text(ctx, formatClock(info.reset5h), 16, 137, 8, "#aaaaaa", "left", "DeckBold");
  text(ctx, "in", 72, 124, 7, "#666666", "center");
  text(ctx, resetIn, 72, 137, 8, "#aaaaaa", "center", "DeckBold");
  text(ctx, "claim", 128, 124, 7, "#666666", "right");
  text(ctx, info.representativeClaim === "five_hour" ? "5h" : "7d", 128, 137, 7, "#aaaaaa", "right", "DeckBold");
  return pngDataUri(img);
}

async function renderError(msg) {
  const { img, ctx } = makeCanvas(W, H);
  rect(ctx, 0, 0, W, H, "#1a1a2e");
  rect(ctx, 13, 11, 9, 9, "#D4A574");
  text(ctx, "Claude", 28, 20, 8, "#dddddd", "left", "DeckBold");
  text(ctx, msg.length > 18 ? msg.slice(0, 18) + "…" : msg, 72, 75, 8, "#E57373", "center");
  text(ctx, "press to retry", 72, 95, 7, "#666666", "center");
  return pngDataUri(img);
}

async function update(ctx, sd) {
  const s = state.get(ctx);
  if (!s) return;
  try {
    const info = await getRateLimits();
    s.lastInfo = info;
    sd.setImage(ctx, await render(info));
    sd.setTitle(ctx, "");
  } catch (e) {
    console.error("usage:", e.message);
    sd.setImage(ctx, s.lastInfo ? await render(s.lastInfo) : await renderError(e.message));
    sd.setTitle(ctx, "");
  }
}

module.exports = {
  appear(ctx, sd) {
    if (state.has(ctx)) return;
    state.set(ctx, { timer: null, lastInfo: null });
    update(ctx, sd);
    state.get(ctx).timer = setInterval(() => update(ctx, sd), POLL_MS);
  },
  disappear(ctx) {
    const s = state.get(ctx);
    if (s && s.timer) clearInterval(s.timer);
    state.delete(ctx);
  },
  keyDown(ctx, sd) {
    update(ctx, sd);
  },
  render,
  renderError,
};
