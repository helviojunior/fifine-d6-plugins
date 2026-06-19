/**
 * Shared radial-gauge renderer for HWiNFO items (AIDA64-style dial).
 *
 * Draws a tick-mark ring (270° sweep, gap at the bottom), the active arc colored
 * green / yellow / red by value, a big centered number, a unit, and a colored
 * label — rendered to PNG via the pureimage canvas.
 *
 * createGaugeItem({intervalMs, collect}) returns the {appear, disappear, keyDown}
 * lifecycle the dispatcher uses; collect() returns { value(0-100), display, unit,
 * label, color? }.
 */

const { makeCanvas, text, pngDataUri } = require("./canvas");

function gaugeColor(v) {
  if (v < 50) return "#4CAF50"; // verde
  if (v < 80) return "#FFC107"; // amarelo
  return "#E53935"; // vermelho
}

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

function tick(ctx, cx, cy, angleDeg, r1, r2, w, color) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const px = -dy, py = dx; // perpendicular
  const hw = w / 2;
  fillPoly(ctx, [
    [cx + r1 * dx + hw * px, cy + r1 * dy + hw * py],
    [cx + r2 * dx + hw * px, cy + r2 * dy + hw * py],
    [cx + r2 * dx - hw * px, cy + r2 * dy - hw * py],
    [cx + r1 * dx - hw * px, cy + r1 * dy - hw * py],
  ], color);
}

const W = 144;
const H = 144;

async function renderGauge({ value, display, unit, label, color }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const col = color || gaugeColor(v);
  const { img, ctx } = makeCanvas(W, H);
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(0, 0, W, H);

  const cx = 72, cy = 64, rIn = 49, rOut = 60, N = 46, startDeg = 135, sweep = 270;
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const ang = startDeg + f * sweep;
    const active = f <= v / 100 + 1e-6;
    tick(ctx, cx, cy, ang, rIn, rOut, 2.6, active ? col : "#3a3a3a");
  }

  text(ctx, String(display), cx, cy + 7, 24, "#f0f0f0", "center", "DeckBold");
  if (unit) text(ctx, unit, cx, cy + 24, 8, "#888888", "center");
  text(ctx, label, cx, 134, 9, col, "center", "DeckBold");

  return pngDataUri(img);
}

function createGaugeItem({ intervalMs, collect }) {
  const timers = new Map();
  async function update(ctx, sd) {
    try {
      sd.setImage(ctx, await renderGauge(await collect()));
      sd.setTitle(ctx, "");
    } catch (e) {
      console.error("gauge:", e.message);
    }
  }
  // Self-scheduling poll loop: the next tick is queued only AFTER the current
  // update settles, so a slow collect (e.g. a cold PowerShell spawn) can never
  // pile up overlapping work the way setInterval would.
  async function loop(ctx, sd) {
    if (!timers.has(ctx)) return; // disappeared mid-update
    await update(ctx, sd);
    if (!timers.has(ctx)) return; // disappeared during update
    timers.set(ctx, setTimeout(() => loop(ctx, sd), intervalMs));
  }
  return {
    appear(ctx, sd) {
      if (timers.has(ctx)) return;
      timers.set(ctx, null); // mark active before the first async update
      loop(ctx, sd);
    },
    disappear(ctx) {
      const t = timers.get(ctx);
      if (t) clearTimeout(t);
      timers.delete(ctx);
    },
    keyDown(ctx, sd) {
      update(ctx, sd);
    },
    collect,
  };
}

module.exports = { renderGauge, createGaugeItem, gaugeColor };
