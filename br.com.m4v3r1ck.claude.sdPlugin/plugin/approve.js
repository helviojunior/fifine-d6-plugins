/**
 * Claude item: permission approve button.
 *
 * Self-contained item module ({appear, disappear, keyDown}). A PermissionRequest
 * hook writes pending tool calls to /tmp/claude-sd/pending-<id>.json and blocks;
 * pressing the key writes /tmp/claude-sd/response-<id> = "approve".
 *
 * The IPC dir must match the hook script (hooks/claude-approve.sh). On macOS
 * that is /tmp/claude-sd; a Windows hook variant would use %TEMP%\claude-sd.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { readFileSync, writeFileSync, readdirSync, unlinkSync } = fs;
const { makeCanvas, text, rect, pngDataUri } = require("./canvas");

const PENDING_DIR = process.platform === "win32" ? path.join(os.tmpdir(), "claude-sd") : "/tmp/claude-sd";
const W = 144, H = 144;
const state = new Map(); // ctx -> { timer, currentRequestId }

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
  const timeLeft = Math.max(0, 60 - Math.round(Date.now() / 1000 - tool.timestamp));
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
        const tool = JSON.parse(readFileSync(path.join(PENDING_DIR, file), "utf-8"));
        if (Date.now() / 1000 - tool.timestamp <= 65) tools.push(tool);
        else try { unlinkSync(path.join(PENDING_DIR, file)); } catch {}
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

async function check(ctx, sd) {
  const s = state.get(ctx);
  if (!s) return;
  try {
    const queue = getPendingQueue();
    if (queue.length > 0) {
      s.currentRequestId = queue[0].request_id;
      sd.setImage(ctx, await renderPending(queue[0], queue.length));
    } else {
      s.currentRequestId = null;
      sd.setImage(ctx, await renderIdle());
    }
    sd.setTitle(ctx, "");
  } catch {
    /* skip */
  }
}

module.exports = {
  async appear(ctx, sd) {
    if (state.has(ctx)) return;
    const s = { timer: null, currentRequestId: null };
    state.set(ctx, s);
    sd.setImage(ctx, await renderIdle());
    s.timer = setInterval(() => check(ctx, sd), 500);
  },
  disappear(ctx) {
    const s = state.get(ctx);
    if (s && s.timer) clearInterval(s.timer);
    state.delete(ctx);
  },
  async keyDown(ctx, sd) {
    const s = state.get(ctx);
    if (!s || !s.currentRequestId) return;
    try {
      writeFileSync(path.join(PENDING_DIR, `response-${s.currentRequestId}`), "approve");
      s.currentRequestId = null;
      sd.setImage(ctx, await renderApproved());
      sd.setTitle(ctx, "");
      setTimeout(() => check(ctx, sd), 800);
    } catch (e) {
      console.error("approve:", e.message);
    }
  },
  renderIdle,
  renderPending,
  renderApproved,
};
