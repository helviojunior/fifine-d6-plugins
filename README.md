# Fifine StreamDock Plugins for macOS

Stream Deck plugins ported to the **Fifine AmpliGame Stream Deck D6** (and other
HotSpot **StreamDock** devices: Ajazz, Mirabox, VSDinside, …).

These are migrated from the Elgato Node SDK versions in
[`../streamdeck-macos-plugins`](../streamdeck-macos-plugins). Instead of the
`@elgato/streamdeck` SDK + TypeScript + esbuild toolchain, each plugin is plain
Node.js talking the StreamDock WebSocket protocol directly (the same approach as
[smereddy/streamdock-zoom-plugin](https://github.com/smereddy/streamdock-zoom-plugin)).
No build/bundling step — the only dependency is `ws`, vendored at build time.

> **Device note:** the D6 has **6 LCD keys and no rotary dials / touch strip**,
> so only keypad plugins are ported. Dial-based plugins from the source repo are
> reworked to keys separately.

## Plugins

| Plugin | Status | Description |
|--------|--------|-------------|
| `com.local.cpu-monitor.sdPlugin` | ✅ ported | Real-time CPU + GPU usage bars on a key |
| memory-monitor | ⏳ planned | RAM / swap / pressure |
| bt-connect | ⏳ planned | Bluetooth connect/disconnect with battery |
| claude-approve | ⏳ planned | Physical approve button for Claude Code |
| claude-usage | ⏳ planned | Claude rate-limit utilization |
| calendar-lcd | ⏳ planned | Today's calendar events on an LCD key |

## Layout

```
<name>.sdPlugin/
  manifest.json            # StreamDock/Elgato-v2 manifest (CodePath → plugin/index.js)
  imgs/                    # action / plugin / category icons
  plugin/
    index.js               # plugin logic (plain Node.js)
    streamdock.js          # shared WebSocket client (replaces @elgato/streamdeck)
    package.json           # declares the `ws` dependency
```

## Build & Install

No Node.js is needed on your machine — only **Docker**.

```bash
# 1. Build all plugins into ./build (vendors deps via node:20 in Docker)
./build.sh

# 2. Install onto the Fifine host (copies to the StreamDock plugins dir + restarts)
cd build && ./install.sh
```

`install.sh` installs into:

```
~/Library/Application Support/HotSpot/StreamDock/plugins/
```

Then open the StreamDock software and find the actions in the list.

## How it works

The StreamDock software launches each plugin's `plugin/index.js` with
`-port`, `-pluginUUID`, `-registerEvent` and `-info` arguments. The plugin opens
a WebSocket to `ws://127.0.0.1:<port>`, registers, and then exchanges JSON
events (`willAppear`, `keyDown`, `setImage`, …). Keypad plugins render an SVG,
encode it as a base64 data URI, and push it with `setImage`.
