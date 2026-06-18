/**
 * Claude Approve — StreamDock plugin (Fifine AmpliGame D6 & compatible).
 *
 * Physical approve button for Claude Code permission requests. A PermissionRequest
 * hook writes pending tool calls to /tmp/claude-sd/pending-<id>.json and blocks;
 * pressing the key writes /tmp/claude-sd/response-<id> = "approve". Rendered as PNG.
 */

const fs = require("fs");
const { readFileSync, writeFileSync, readdirSync, unlinkSync } = fs;
const { StreamDock } = require("./streamdock");
const { makeCanvas, text, rect, pngDataUri } = require("./canvas");

process.on("uncaughtException", (e) => console.error("uncaught:", e));
process.on("unhandledRejection", (e) => console.error("unhandled:", e));

const PENDING_DIR = "/tmp/claude-sd";
const W = 144;
const H = 144;

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function toolSummary(tool) {
  const name = tool.tool_name;
  const input = tool.tool_input || {};
  switch (name) {
    case "Bash":
      return { line1: "Bash", line2: truncate(input.command || "", 24), line3: input.description ? truncate(input.description, 24) : "" };
    case "Write":
      return { line1: "Write", line2: truncate((input.file_path || "").split("/").pop() || "", 24), line3: `${((input.content || "").length / 1024).toFixed(1)}KB` };
    case "Edit":
      return { line1: "Edit", line2: truncate((input.file_path || "").split("/").pop() || "", 24), line3: truncate((input.new_string || "").split("\n")[0] || "", 24) };
    case "NotebookEdit":
      return { line1: "Notebook", line2: truncate((input.notebook_path || "").split("/").pop() || "", 24), line3: input.edit_mode || "replace" };
    default:
      return { line1: truncate(name, 24), line2: truncate(JSON.stringify(input).slice(0, 24), 24), line3: "" };
  }
}

// outline rectangle drawn as 4 thin filled rects
function outline(ctx, x, y, w, h, t, color) {
  rect(ctx, x, y, w, t, color);
  rect(ctx, x, y + h - t, w, t, color);
  rect(ctx, x, y, t, h, color);
  rect(ctx, x + w - t, y, t, h, color);
}

async function renderIdle() {
  const { img, ctx } = makeCanvas(W, H);
  rect(ctx, 0, 0, W, H, "#1a1a2e");
  text(ctx, "Claude", 72, 60, 11, "#555555", "center", "DeckBold");
  text(ctx, "Waiting...", 72, 82, 8, "#444444", "center");
  rect(ctx, 64, 100, 16, 16, "#333333");
  return pngDataUri(img);
}

async function renderPending(tool, queueSize) {
  const { img, ctx } = makeCanvas(W, H);
  const s = toolSummary(tool);
  const age = Math.round(Date.now() / 1000 - tool.timestamp);
  const timeLeft = Math.max(0, 60 - age);
  const queueLabel = queueSize > 1 ? `1/${queueSize}` : "";

  rect(ctx, 0, 0, W, H, "#1a1a2e");
  outline(ctx, 4, 4, 136, 136, 3, "#FFA726");
  text(ctx, s.line1, 72, 28, 11, "#FFA726", "center", "DeckBold");
  text(ctx, s.line2, 72, 48, 8, "#cccccc", "center");
  if (s.line3) text(ctx, s.line3, 72, 64, 7, "#888888", "center");
  rect(ctx, 22, 80, 100, 30, "#4CAF50");
  text(ctx, "APPROVE", 72, 100, 11, "#ffffff", "center", "DeckBold");
  text(ctx, `${timeLeft}s`, queueLabel ? 28 : 72, 130, 8, "#666666", "center");
  if (queueLabel) text(ctx, queueLabel, 110, 130, 8, "#FFA726", "center", "DeckBold");
  return pngDataUri(img);
}

async function renderApproved() {
  const { img, ctx } = makeCanvas(W, H);
  rect(ctx, 0, 0, W, H, "#1a1a2e");
  outline(ctx, 4, 4, 136, 136, 3, "#4CAF50");
  text(ctx, "✓", 72, 76, 30, "#4CAF50", "center", "DeckBold");
  text(ctx, "Approved", 72, 100, 11, "#4CAF50", "center", "DeckBold");
  return pngDataUri(img);
}

function getPendingQueue() {
  try {
    const files = readdirSync(PENDING_DIR).filter((f) => f.startsWith("pending-") && f.endsWith(".json"));
    const tools = [];
    for (const file of files) {
      try {
        const tool = JSON.parse(readFileSync(`${PENDING_DIR}/${file}`, "utf-8"));
        if (Date.now() / 1000 - tool.timestamp <= 65) tools.push(tool);
        else try { unlinkSync(`${PENDING_DIR}/${file}`); } catch {}
      } catch {
        /* skip unreadable */
      }
    }
    tools.sort((a, b) => a.timestamp - b.timestamp);
    return tools;
  } catch {
    return [];
  }
}

// --- Plugin ---

const sd = new StreamDock();
const instances = new Map(); // context -> { timer, currentRequestId }

async function checkPending(context) {
  const state = instances.get(context);
  if (!state) return;
  try {
    const queue = getPendingQueue();
    if (queue.length > 0) {
      const next = queue[0];
      state.currentRequestId = next.request_id;
      sd.setImage(context, await renderPending(next, queue.length));
    } else {
      state.currentRequestId = null;
      sd.setImage(context, await renderIdle());
    }
    sd.setTitle(context, "");
  } catch {
    /* skip */
  }
}

sd.on("willAppear", async (msg) => {
  const context = msg.context;
  if (instances.has(context)) return;
  const state = { timer: null, currentRequestId: null };
  instances.set(context, state);
  sd.setImage(context, await renderIdle());
  state.timer = setInterval(() => checkPending(context), 500);
});

sd.on("willDisappear", (msg) => {
  const state = instances.get(msg.context);
  if (state && state.timer) clearInterval(state.timer);
  instances.delete(msg.context);
});

sd.on("keyDown", async (msg) => {
  const context = msg.context;
  const state = instances.get(context);
  if (!state || !state.currentRequestId) return;
  try {
    writeFileSync(`${PENDING_DIR}/response-${state.currentRequestId}`, "approve");
    state.currentRequestId = null;
    sd.setImage(context, await renderApproved());
    sd.setTitle(context, "");
    setTimeout(() => checkPending(context), 800);
  } catch (err) {
    console.error("Failed to write approval:", err.message);
  }
});

if (require.main === module) sd.connect();

module.exports = { renderIdle, renderPending, renderApproved };
