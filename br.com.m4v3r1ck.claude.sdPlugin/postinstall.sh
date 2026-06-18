#!/bin/bash
# Runs after install.sh copies this plugin. $1 = installed plugin dir.
# Wires the Claude Code PermissionRequest hook to this plugin's hook script.
set -e
PLUGIN_DIR="${1:-$(cd "$(dirname "$0")" && pwd)}"
export SD_HOOK_PATH="$PLUGIN_DIR/hooks/claude-approve.sh"
chmod +x "$SD_HOOK_PATH" 2>/dev/null || true
echo "Configuring Claude Code PermissionRequest hook -> $SD_HOOK_PATH"
/usr/bin/python3 -c '
import json, os
sf = os.path.expanduser("~/.claude/settings.json")
hp = os.environ["SD_HOOK_PATH"]
if os.path.isfile(sf):
    with open(sf) as f: settings = json.load(f)
else:
    os.makedirs(os.path.dirname(sf), exist_ok=True); settings = {}
pre = settings.setdefault("hooks", {}).setdefault("PermissionRequest", [])
found = False
for entry in pre:
    for h in entry.get("hooks", []):
        if "claude-approve.sh" in h.get("command", ""):
            h["command"] = hp; found = True
if not found:
    pre.append({"matcher": "", "hooks": [{"type": "command", "command": hp}]})
with open(sf, "w") as f: json.dump(settings, f, indent=2); f.write("\n")
print("  hook configured" + ("" if found else " (added)"))
'
