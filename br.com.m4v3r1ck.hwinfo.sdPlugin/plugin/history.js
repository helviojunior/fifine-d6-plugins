/**
 * Shared "current value + history sparkline" renderer for HWiNFO items.
 *
 * Draws a title, a big current value, and a filled area history graph (auto-
 * scaled to the recent buffer). CPU items are green, GPU items red/orange.
 *
 * createHistoryItem({intervalMs, title, color, collect}) returns the
 * {appear, disappear, keyDown} lifecycle; collect() returns { value(number),
 * display(string) }. Each key context keeps its own ring buffer.
 */

const { makeCanvas, text, pngDataUri } = require("./canvas");

const W = 144;
const H = 144;
const CAP = 48; // history samples kept

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

function scale(hex, f) {
  const c = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f));
  return "#" + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

function sparkline(ctx, hist, x, y, w, h, color) {
  if (hist.length < 2) return;
  const min = Math.min(...hist);
  const max = Math.max(...hist);
  const rng = max - min || 1;
  const pts = hist.map((v, i) => [x + (w * i) / (hist.length - 1), y + h - ((v - min) / rng) * h * 0.9 - 2]);
  fillPoly(ctx, [[x, y + h], ...pts, [x + w, y + h]], scale(color, 0.32)); // filled area
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    fillPoly(ctx, [[a[0], a[1] - 1], [b[0], b[1] - 1], [b[0], b[1] + 1], [a[0], a[1] + 1]], color); // top line
  }
}

async function renderHistory({ title, value, hist, color }) {
  const { img, ctx } = makeCanvas(W, H);
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, W, H);
  text(ctx, title, 72, 26, 9, "#cfcfcf", "center", "DeckBold");
  text(ctx, value, 72, 60, 15, "#ffffff", "center", "DeckBold");
  sparkline(ctx, hist || [], 8, 84, 128, 52, color);
  return pngDataUri(img);
}

function createHistoryItem({ intervalMs, title, color, collect }) {
  const hist = new Map(); // ctx -> number[]
  const timers = new Map();
  async function update(ctx, sd) {
    try {
      const { value, display } = await collect();
      let arr = hist.get(ctx) || [];
      arr.push(Number(value) || 0);
      if (arr.length > CAP) arr.shift();
      hist.set(ctx, arr);
      sd.setImage(ctx, await renderHistory({ title, value: display, hist: arr, color }));
      sd.setTitle(ctx, "");
    } catch (e) {
      console.error("history:", e.message);
    }
  }
  return {
    appear(ctx, sd) {
      if (timers.has(ctx)) return;
      hist.set(ctx, []);
      update(ctx, sd);
      timers.set(ctx, setInterval(() => update(ctx, sd), intervalMs));
    },
    disappear(ctx) {
      const t = timers.get(ctx);
      if (t) clearInterval(t);
      timers.delete(ctx);
      hist.delete(ctx);
    },
    keyDown(ctx, sd) {
      update(ctx, sd);
    },
    collect,
  };
}

module.exports = { renderHistory, createHistoryItem };
