/**
 * HWiNFO — StreamDock plugin (Fifine AmpliGame D6 & compatible).
 *
 * A single plugin exposing one "HWiNFO" category with one action per hardware
 * item. Each item is a self-contained module ({appear, disappear, keyDown});
 * this dispatcher just routes events to the module that owns each key context.
 *
 * Add a new hardware item by writing a module and registering its action UUID
 * in ITEMS (and adding the Action to manifest.json).
 */

const { StreamDock } = require("./streamdock");

process.on("uncaughtException", (e) => console.error("uncaught:", e));
process.on("unhandledRejection", (e) => console.error("unhandled:", e));

const ITEMS = {
  "br.com.m4v3r1ck.hwinfo.cpu": require("./cpu"),
  "br.com.m4v3r1ck.hwinfo.memory": require("./memory"),
  "br.com.m4v3r1ck.hwinfo.cpuload": require("./cpu-util"),
  "br.com.m4v3r1ck.hwinfo.gpuload": require("./gpu-util"),
  "br.com.m4v3r1ck.hwinfo.ramload": require("./ram-util"),
  "br.com.m4v3r1ck.hwinfo.cputemp": require("./cpu-temp"),
  "br.com.m4v3r1ck.hwinfo.gputemp": require("./gpu-temp"),
  // history (current value + sparkline) items
  "br.com.m4v3r1ck.hwinfo.h.cpuusage": require("./h-cpu-usage"),
  "br.com.m4v3r1ck.hwinfo.h.gpuusage": require("./h-gpu-usage"),
  "br.com.m4v3r1ck.hwinfo.h.gpuclock": require("./h-gpu-clock"),
  "br.com.m4v3r1ck.hwinfo.h.gpumem": require("./h-gpu-mem"),
  "br.com.m4v3r1ck.hwinfo.h.gputemp": require("./h-gpu-temp"),
  // privileged-helper backed items (real °C / power / clock / fan)
  "br.com.m4v3r1ck.hwinfo.h.cpuclock": require("./h-cpu-clock"),
  "br.com.m4v3r1ck.hwinfo.h.cpupwr": require("./h-cpu-pwr"),
  "br.com.m4v3r1ck.hwinfo.h.cputemp": require("./h-cpu-temp"),
  "br.com.m4v3r1ck.hwinfo.fan": require("./fan"),
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
