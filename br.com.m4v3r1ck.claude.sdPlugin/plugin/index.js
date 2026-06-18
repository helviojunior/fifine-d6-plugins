/**
 * Claude — StreamDock plugin (Fifine AmpliGame D6 & compatible).
 *
 * A single plugin exposing one "Claude" category with one action per item.
 * Each item is a self-contained module ({appear, disappear, keyDown}); this
 * dispatcher routes events to the module that owns each key context.
 */

const { StreamDock } = require("./streamdock");

process.on("uncaughtException", (e) => console.error("uncaught:", e));
process.on("unhandledRejection", (e) => console.error("unhandled:", e));

const ITEMS = {
  "br.com.m4v3r1ck.claude.usage": require("./usage"),
  "br.com.m4v3r1ck.claude.approve": require("./approve"),
};

const sd = new StreamDock();
const owner = new Map(); // context -> item module

sd.on("willAppear", (msg) => {
  const item = ITEMS[msg.action];
  if (!item) return;
  owner.set(msg.context, item);
  item.appear(msg.context, sd);
});

sd.on("willDisappear", (msg) => {
  const item = owner.get(msg.context);
  if (item) {
    item.disappear(msg.context);
    owner.delete(msg.context);
  }
});

sd.on("keyDown", (msg) => {
  const item = owner.get(msg.context) || ITEMS[msg.action];
  if (item) item.keyDown(msg.context, sd);
});

if (require.main === module) sd.connect();
