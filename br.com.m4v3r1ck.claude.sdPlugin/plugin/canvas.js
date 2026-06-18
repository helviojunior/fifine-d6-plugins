/**
 * Shared raster helper for StreamDock keypad plugins.
 *
 * The Fifine/StreamDock devices render PNG images sent via `setImage` but do
 * NOT render SVG data URIs. Elgato's software accepts SVG; StreamDock does not.
 * So instead of emitting SVG we draw with pureimage (a pure-JS canvas — no
 * native binaries, so it vendors via Docker and runs under the app's bundled
 * node20 on macOS) and emit a base64 PNG data URI.
 */

const fs = require("fs");
const path = require("path");
const { Writable } = require("stream");
const PImage = require("pureimage");

// Register the bundled fonts once. "Deck" = regular, "DeckBold" = bold.
let _fontsLoaded = false;
function ensureFonts() {
  if (_fontsLoaded) return;
  const reg = PImage.registerFont(path.join(__dirname, "fonts", "DejaVuSans.ttf"), "Deck");
  reg.loadSync();
  try {
    const bold = PImage.registerFont(path.join(__dirname, "fonts", "DejaVuSans-Bold.ttf"), "DeckBold");
    bold.loadSync();
  } catch {
    /* bold optional */
  }
  _fontsLoaded = true;
}

/** Create a {img, ctx} pair of the given size. */
function makeCanvas(w, h) {
  ensureFonts();
  const img = PImage.make(w, h);
  const ctx = img.getContext("2d");
  return { img, ctx };
}

/**
 * Draw text. ptSize is in points (pureimage uses pt; ~0.75 * px).
 * align: "left" (default) | "right" | "center". family: "Deck" | "DeckBold".
 */
function text(ctx, str, x, y, ptSize, color, align = "left", family = "Deck") {
  ctx.font = `${ptSize}pt ${family}`;
  ctx.fillStyle = color;
  let tx = x;
  if (align !== "left") {
    const m = ctx.measureText(String(str));
    tx = align === "right" ? x - m.width : x - m.width / 2;
  }
  ctx.fillText(String(str), tx, y);
}

/** Filled rectangle convenience. */
function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Encode a pureimage bitmap to an in-memory PNG buffer. */
function encodePng(img) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk);
        cb();
      },
    });
    sink.on("finish", () => resolve(Buffer.concat(chunks)));
    sink.on("error", reject);
    PImage.encodePNGToStream(img, sink).catch(reject);
  });
}

/** Encode a pureimage bitmap directly to a base64 PNG data URI. */
async function pngDataUri(img) {
  const buf = await encodePng(img);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

module.exports = { PImage, makeCanvas, text, rect, encodePng, pngDataUri };
