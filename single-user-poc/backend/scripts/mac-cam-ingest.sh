#!/usr/bin/env bash
# Snap a frame from the Mac camera and POST it to /ingest on a loop.
#
# Usage: API_URL=https://xxx.execute-api.eu-west-1.amazonaws.com ./scripts/mac-cam-ingest.sh
# Env:
#   API_URL     (required) — the SST `api` output
#   CAMERA_ID   default: mac
#   INTERVAL    default: 5  (seconds between snaps)
#   WARMUP      default: 1  (camera warm-up seconds for imagesnap)
#
# First run: macOS will prompt your terminal app for Camera permission.

set -euo pipefail

: "${API_URL:?set API_URL to the SST api output}"
CAMERA_ID="${CAMERA_ID:-mac}"
INTERVAL="${INTERVAL:-5}"
WARMUP="${WARMUP:-1}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

snap() {
  local out="$1"
  if command -v imagesnap >/dev/null 2>&1; then
    imagesnap -q -w "$WARMUP" "$out" >/dev/null
  elif command -v ffmpeg >/dev/null 2>&1; then
    ffmpeg -loglevel error -y -f avfoundation -framerate 30 -video_size 1280x720 \
      -i "0" -frames:v 1 "$out"
  else
    echo "Need imagesnap (brew install imagesnap) or ffmpeg (brew install ffmpeg)" >&2
    exit 1
  fi
}

echo "Posting frames to $API_URL/ingest?cameraId=$CAMERA_ID every ${INTERVAL}s. Ctrl-C to stop."
while true; do
  frame="$TMP/frame.jpg"
  snap "$frame"
  size=$(wc -c <"$frame" | tr -d ' ')
  resp=$(curl -sS -o /dev/stderr -w "%{http_code}" \
    -X POST "$API_URL/ingest?cameraId=$CAMERA_ID" \
    -H "Content-Type: image/jpeg" \
    --data-binary "@$frame" || true)
  echo "  [$(date +%H:%M:%S)] ${size}B → HTTP $resp"
  sleep "$INTERVAL"
done
