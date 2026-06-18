/**
 * Minimal StreamDock / Stream Deck plugin client.
 *
 * Implements the Elgato SDK v2 WebSocket protocol that the HotSpot StreamDock
 * software (Fifine AmpliGame D6, Ajazz, Mirabox, ...) speaks. The plugin is
 * launched by the host with `-port`, `-pluginUUID`, `-registerEvent` and
 * `-info` arguments, connects to a local WebSocket, registers, then exchanges
 * JSON events.
 *
 * This is a shared base used by every plugin in this repo. It replaces the
 * `@elgato/streamdeck` Node SDK so plugins run directly under StreamDock with
 * no build/bundling step.
 */

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

// Lightweight debug log. Enabled when SD_DEBUG is set (install.sh can export it)
// or always-on to /tmp during bring-up. Writes one file per plugin.
// Debug logging is opt-in via SD_DEBUG=1 (the `run` wrapper can export it).
// Logs go next to the plugin — the host child process inherits the app's env
// and writes within the plugin's own dir.
const DEBUG = process.env.SD_DEBUG === "1";
const DEBUG_FILE = path.join(__dirname, "debug.log");
function dbg(...args) {
  if (!DEBUG) return;
  const line = `[${new Date().toISOString()}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`;
  try {
    fs.appendFileSync(DEBUG_FILE, line);
  } catch {
    /* ignore */
  }
}

class StreamDock {
  constructor() {
    this.ws = null;
    this.port = null;
    this.pluginUUID = null;
    this.registerEvent = null;
    this.info = null;
    this.handlers = {};
    dbg("=== plugin process start ===", "argv:", process.argv.slice(1).join(" "));
  }

  /** Register a handler for an inbound event (e.g. "keyDown", "willAppear"). */
  on(event, fn) {
    this.handlers[event] = fn;
    return this;
  }

  connect() {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-port") this.port = args[++i];
      else if (args[i] === "-pluginUUID") this.pluginUUID = args[++i];
      else if (args[i] === "-registerEvent") this.registerEvent = args[++i];
      else if (args[i] === "-info") {
        try {
          this.info = JSON.parse(args[++i]);
        } catch {
          /* ignore malformed -info */
        }
      }
    }

    if (!this.port) {
      console.error("[streamdock] no -port argument; not launched by host?");
      return;
    }

    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);

    dbg("connecting to ws://127.0.0.1:" + this.port, "uuid:", this.pluginUUID, "registerEvent:", this.registerEvent);

    this.ws.on("open", () => {
      dbg("ws open -> register");
      this.send({ event: this.registerEvent, uuid: this.pluginUUID });
      this._emit("connected", {});
    });

    this.ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      dbg("recv:", msg.event, "ctx:", msg.context || "");
      this._emit(msg.event, msg);
    });

    this.ws.on("error", (err) => {
      dbg("ws error:", err.message);
      console.error("[streamdock] ws error:", err.message);
    });
    this.ws.on("close", () => {
      dbg("ws close");
      this._emit("disconnected", {});
    });
  }

  _emit(event, msg) {
    const fn = this.handlers[event];
    if (!fn) return;
    try {
      const r = fn(msg);
      if (r && typeof r.catch === "function") r.catch((e) => console.error(`[streamdock] ${event}:`, e));
    } catch (e) {
      console.error(`[streamdock] handler ${event} failed:`, e);
    }
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (obj.event !== this.registerEvent) {
        const img = obj.payload && obj.payload.image;
        dbg("send:", obj.event, "ctx:", obj.context || "", img ? `image(${img.length}b ${String(img).slice(0, 22)}...)` : JSON.stringify(obj.payload || {}).slice(0, 60));
      }
      this.ws.send(JSON.stringify(obj));
    } else {
      dbg("send DROPPED (ws not open):", obj.event);
    }
  }

  // --- Outbound helpers (subset of the Stream Deck command set) ---

  setImage(context, image, state = 0, target = 0) {
    this.send({ event: "setImage", context, payload: { image, target, state } });
  }

  setTitle(context, title = "", state = 0, target = 0) {
    this.send({ event: "setTitle", context, payload: { title, target, state } });
  }

  setState(context, state) {
    this.send({ event: "setState", context, payload: { state } });
  }

  setSettings(context, settings) {
    this.send({ event: "setSettings", context, payload: settings });
  }

  getSettings(context) {
    this.send({ event: "getSettings", context });
  }

  setGlobalSettings(settings) {
    this.send({ event: "setGlobalSettings", context: this.pluginUUID, payload: settings });
  }

  getGlobalSettings() {
    this.send({ event: "getGlobalSettings", context: this.pluginUUID });
  }

  setFeedback(context, payload) {
    this.send({ event: "setFeedback", context, payload });
  }

  showAlert(context) {
    this.send({ event: "showAlert", context });
  }

  showOk(context) {
    this.send({ event: "showOk", context });
  }

  openUrl(url) {
    this.send({ event: "openUrl", payload: { url } });
  }

  logMessage(message) {
    this.send({ event: "logMessage", payload: { message: String(message) } });
  }
}

module.exports = { StreamDock };
