#!/usr/bin/env bash
# Install a launchd agent so the IVA streamer runs at login and survives logouts.
#
# Usage:
#   ./Scripts/install-launchagent.sh /path/to/IVA.app
#
# IVA.app must already be registered (run it once interactively to paste the
# token and pick a camera). After that, this script registers an agent that
# auto-starts the streaming pipeline.

set -euo pipefail

APP_PATH="${1:?usage: $0 /path/to/IVA.app}"
LABEL="tech.sp33c.iva"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$APP_PATH/Contents/MacOS/IVA</string>
    <string>--headless</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Application Support/IVA/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Application Support/IVA/launchd.err.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed $LABEL — agent will auto-start at login."
echo "To remove:  launchctl unload \"$PLIST\" && rm \"$PLIST\""
