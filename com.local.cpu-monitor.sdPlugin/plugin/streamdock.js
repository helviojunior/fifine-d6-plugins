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

class StreamDock {
  constructor() {
    this.ws = null;
    this.port = null;
    this.pluginUUID = null;
    this.registerEvent = null;
    this.info = null;
    this.handlers = {};
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

    this.ws.on("open", () => {
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
      this._emit(msg.event, msg);
    });

    this.ws.on("error", (err) => console.error("[streamdock] ws error:", err.message));
    this.ws.on("close", () => this._emit("disconnected", {}));
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
      this.ws.send(JSON.stringify(obj));
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
