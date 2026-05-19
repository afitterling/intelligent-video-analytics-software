#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

CONFIG="${1:-release}"
swift build -c "$CONFIG"

BIN_DIR="$(swift build -c "$CONFIG" --show-bin-path)"
APP="$BIN_DIR/IVA.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$BIN_DIR/IVA" "$APP/Contents/MacOS/IVA"
cp IVA/Info.plist "$APP/Contents/Info.plist"

codesign --force --sign - --entitlements "$BIN_DIR/IVA-entitlement.plist" "$APP" 2>/dev/null \
  || codesign --force --sign - "$APP"

echo "Built: $APP"
