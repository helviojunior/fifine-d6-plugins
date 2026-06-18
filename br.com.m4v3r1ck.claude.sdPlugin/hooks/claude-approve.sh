#!/bin/bash
# Claude Code PermissionRequest hook — fires ONLY when a permission dialog
# is about to be shown. Writes a unique pending file per request (keyed by
# tool_use_id) so multiple sessions can queue approvals simultaneously.

PENDING_DIR="/tmp/claude-sd"
TIMEOUT=60

# Ensure pending directory exists
mkdir -p "$PENDING_DIR"

# Write pending file and extract the request ID
REQUEST_ID=$(/usr/bin/python3 -c '
import json, sys, os, time, hashlib

data = json.load(sys.stdin)

tool_name = data.get("tool_name", "")
tool_input = data.get("tool_input", {})
tool_use_id = data.get("tool_use_id", "")
session_id = data.get("session_id", "")

# Use tool_use_id as unique key, fall back to hash of timestamp
req_id = tool_use_id or hashlib.md5(f"{session_id}{time.time()}".encode()).hexdigest()[:12]

pending_dir = os.environ.get("SD_PENDING_DIR", "/tmp/claude-sd")
pending_file = os.path.join(pending_dir, f"pending-{req_id}.json")

info = {
    "tool_name": tool_name,
    "tool_input": tool_input,
    "timestamp": time.time(),
    "session_id": session_id,
    "request_id": req_id,
}
with open(pending_file, "w") as f:
    json.dump(info, f)

print(req_id)
' <<< "$( cat )" 2>/dev/null)

if [ -z "$REQUEST_ID" ]; then
  # Python failed — fall through without blocking
  exit 0
fi

PENDING_FILE="$PENDING_DIR/pending-${REQUEST_ID}.json"
RESPONSE_FILE="$PENDING_DIR/response-${REQUEST_ID}"

# Wait for Stream Deck button press
SECONDS=0
while [ $SECONDS -lt $TIMEOUT ]; do
  if [ -f "$RESPONSE_FILE" ]; then
    DECISION=$(cat "$RESPONSE_FILE")
    rm -f "$RESPONSE_FILE" "$PENDING_FILE"

    if [ "$DECISION" = "approve" ]; then
      echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
      exit 0
    else
      echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny"}}}'
      exit 0
    fi
  fi
  sleep 0.3
done

# Timeout — clean up and fall through to Claude's normal permission prompt
rm -f "$PENDING_FILE"
exit 0
