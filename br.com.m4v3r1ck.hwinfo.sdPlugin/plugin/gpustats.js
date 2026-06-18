/**
 * Shared GPU stats reader (macOS, no sudo) via `ioreg -r -c IOAccelerator -l`.
 *
 * Machines can expose multiple GPUs (e.g. Intel iGPU + AMD dGPU); for each
 * metric we take the max meaningful value (the active discrete GPU). Cached for
 * a short window so multiple GPU tiles share one ioreg call.
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const exec = promisify(execFile);

let cache = null;
let cacheAt = 0;
const TTL_MS = 1500;

function allInts(stdout, key) {
  const re = new RegExp(`"${key}"=(\\d+)`, "g");
  const out = [];
  let m;
  while ((m = re.exec(stdout))) out.push(Number(m[1]));
  return out;
}

async function read() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  const { stdout } = await exec("ioreg", ["-r", "-c", "IOAccelerator", "-l"]);

  const util = Math.max(
    0,
    ...allInts(stdout, "Device Utilization %"),
    ...allInts(stdout, "Renderer Utilization %"),
    ...allInts(stdout, "Tiler Utilization %")
  );
  const clockMHz = Math.max(0, ...allInts(stdout, "Core Clock\\(MHz\\)"));
  const powerW = Math.max(0, ...allInts(stdout, "Total Power\\(W\\)"));
  // VRAM in use — filter out garbage/overflow uint64 values (> 64 GiB).
  const vramBytes = allInts(stdout, "inUseVidMemoryBytes").filter((b) => b < 64 * 1024 ** 3);
  const vramMB = vramBytes.length ? Math.round(Math.max(...vramBytes) / 1048576) : 0;

  cache = { util, clockMHz, powerW, vramMB };
  cacheAt = now;
  return cache;
}

module.exports = { read };
