# Fifine StreamDock Plugins for macOS

Stream Deck plugins ported to the **Fifine AmpliGame Stream Deck D6** (and other
HotSpot **StreamDock** devices: Ajazz, Mirabox, VSDinside, …), migrated from the
Elgato Node SDK versions in [`../streamdeck-macos-plugins`](../streamdeck-macos-plugins).

Each plugin is plain Node.js talking the StreamDock WebSocket protocol directly
(no `@elgato/streamdeck`, no TypeScript/esbuild). Keypad plugins render their
display as a **PNG** with [pureimage](https://github.com/joshmarinacci/node-pureimage)
(a pure-JS canvas — no native binaries) and push it via `setImage`.

> **Device:** the D6 has **15 LCD keys (5×3) and no rotary dials**, so only
> keypad plugins are ported.

## Plugins

Two consolidated plugins, each a **category** with one action per item. UUID
prefix: `br.com.m4v3r1ck.*`.

### `br.com.m4v3r1ck.hwinfo.sdPlugin` — category **HWiNFO**
| Item | Style | Data |
|------|-------|------|
| CPU / GPU | bars | `top` + `ioreg` (real %) |
| Memory | bars | `vm_stat` / `sysctl` (real) |
| CPU Load (gauge) | radial gauge | `top` (real %) |
| RAM Load (gauge) | radial gauge | `vm_stat` (real %) |
| CPU Temp (gauge) | radial gauge | `machdep.xcpm.cpu_thermal_level` (0-100 index) |
| GPU Temp (gauge) | radial gauge | `machdep.xcpm.gpu_thermal_level` (0-100 index) |

Radial gauges are colored **green / yellow / red** by value.

> **macOS sensor limitation:** real CPU/GPU temperature in °C and **fan RPM**
> require privileged access (`sudo powermetrics`) or an SMC helper. On recent
> macOS the legacy SMC IOKit reads are restricted, so a Stream Deck plugin
> cannot read them unattended. The Temp gauges therefore use the no-sudo
> *thermal level* (0-100) as a proxy; **CPU/GPU fan gauges are not included**
> because no fan data is available without sudo.

### `br.com.m4v3r1ck.claude.sdPlugin` — category **Claude**
| Item | Data |
|------|------|
| Usage | Keychain OAuth token + 1-token API poll (5h/7d utilization) |
| Approve | file-IPC + Claude Code PermissionRequest hook |

### Deferred
`bt-connect` and `calendar-lcd` (need host Swift helpers + a Property Inspector +
blueutil / Calendar permission) and the **Windows port** (PowerShell data,
`.cmd` launcher) are not done yet.

## How the StreamDock plugin model works (hard-won notes)

These differ from Elgato and are why a straight copy of the Elgato plugins does
**not** run on the D6:

1. **`CodePathMac` is launched as a native executable — not a Node script.**
   Elgato runs `CodePath` (`*.js`) with a bundled node when a `Nodejs` manifest
   block is present. StreamDock on macOS instead `exec`s `CodePathMac` directly.
   So each plugin ships a small executable **`run`** wrapper that locates the
   StreamDock app's bundled `node20` (via the parent PID / known app paths) and
   execs `plugin/index.js`, forwarding `-port -pluginUUID -registerEvent -info`.

2. **The device renders PNG via `setImage`, not SVG.** An SVG data URI shows up
   black. So we rasterize to PNG with pureimage + a bundled DejaVu font
   (`plugin/canvas.js`).

3. **Manifest:** `CodePathMac` + `Software.MinimumVersion: "2.9"`, no `Nodejs`
   block. Icons are PNG (`imgs/*.png`).

4. **Install path:** `~/Library/Application Support/HotSpot/StreamDock/plugins/`.
   The app must be restarted to pick up new/changed plugins.

## Layout

```
<name>.sdPlugin/
  manifest.json            # CodePathMac → run
  run                      # executable launcher: bundled node20 + plugin/index.js
  imgs/                    # action / plugin / category PNG icons
  plugin/
    index.js               # plugin logic (plain Node.js)
    streamdock.js          # shared WebSocket client (Elgato-v2 protocol)
    canvas.js              # shared pureimage → PNG helper
    fonts/                 # bundled DejaVu fonts
    package.json           # deps: ws, pureimage
```

## Build & Install

No Node.js is needed on your machine — only **Docker**.

```bash
./build.sh                 # vendors deps via node:20 Docker → ./build
cd build && ./install.sh   # copies to the StreamDock plugins dir + restarts app
```

`build.sh` chmod's each plugin's `run` launcher. `install.sh` reports any
optional `postinstall.sh` (e.g. claude-approve's Claude Code hook wiring), which
is **not** run automatically.

## Validating a render without the hardware

Each plugin's render functions are exported (guarded by `require.main`), so you
can render a sample PNG under the app's bundled node20 and inspect it:

```bash
NODE="/Applications/fifine Control Deck.app/Contents/Helpers/node20"
P=build/com.local.cpu-monitor.sdPlugin/plugin
NODE_PATH="$P/node_modules" "$NODE" -e 'require("./index.js")' # etc.
```
