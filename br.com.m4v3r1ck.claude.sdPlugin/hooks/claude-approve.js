#!/usr/bin/env node
/**
 * Claude Code PermissionRequest hook — cross-platform (Windows / macOS / Linux).
 *
 * Fires only when a permission dialog is about to be shown. Writes one pending
 * file per request to the IPC dir, then blocks until the StreamDock "Approve"
 * key writes a matching response file (or it times out and falls through to
 * Claude's normal prompt).
 *
 * The IPC dir MUST match the plugin (plugin/approve.js): <os tmpdir>/claude-sd.
 * Wire it up with:  node "<plugin>/hooks/claude-approve.js"
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const PENDING_DIR = process.env.SD_PENDING_DIR || path.join(os.tmpdir(), "claude-sd");
const TIMEOUT_MS = 60_000;
const POLL_MS = 300;

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    // If nothing is piped, don't hang forever.
    setTimeout(() => resolve(data), 2000);
  });
}

function emit(behavior) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior },
      },
    })
  );
}

(async () => {
  try {
    fs.mkdirSync(PENDING_DIR, { recursive: true });
  } catch {
    process.exit(0); // can't create IPC dir — fall through silently
  }

  let data = {};
  try {
    data = JSON.parse((await readStdin()).trim() || "{}");
  } catch {
    process.exit(0);
  }

  const reqId =
    data.tool_use_id ||
    `${data.session_id || "sess"}-${process.pid}-${Math.floor(Date.now() / 1000)}`;
  const pendingFile = path.join(PENDING_DIR, `pending-${reqId}.json`);
  const responseFile = path.join(PENDING_DIR, `response-${reqId}`);

  try {
    fs.writeFileSync(
      pendingFile,
      JSON.stringify({
        tool_name: data.tool_name || "",
        tool_input: data.tool_input || {},
        timestamp: Date.now() / 1000,
        session_id: data.session_id || "",
        request_id: reqId,
      })
    );
  } catch {
    process.exit(0);
  }

  const cleanup = () => {
    try { fs.unlinkSync(pendingFile); } catch {}
    try { fs.unlinkSync(responseFile); } catch {}
  };

  const started = Date.now();
  const tick = () => {
    let decision = null;
    try {
      decision = fs.readFileSync(responseFile, "utf-8").trim();
    } catch {
      /* not yet */
    }
    if (decision != null) {
      cleanup();
      emit(decision === "approve" ? "allow" : "deny");
      process.exit(0);
    }
    if (Date.now() - started >= TIMEOUT_MS) {
      cleanup(); // timeout — fall through to Claude's normal prompt
      process.exit(0);
    }
    setTimeout(tick, POLL_MS);
  };
  tick();
})();
