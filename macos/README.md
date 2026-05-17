# IVA macOS Agent

A SwiftUI app that:

1. Asks the user to paste a **registration token** issued by the IVA web app.
2. Lets the user pick a camera (any `AVCaptureDevice` — built-in iSight, USB
   webcam, Continuity Camera iPhone, OBS Virtual Camera).
3. Exchanges the token at `POST /agents/exchange` for temporary KVS producer
   credentials and a per-device stream name.
4. Spawns a `gst-launch-1.0` pipeline that captures the selected camera and
   pushes H.264 to the device's Kinesis Video Stream via the `kvssink` plugin.
5. Periodically calls `POST /agents/refresh` to renew the STS credentials
   before they expire, and writes them to a file `kvssink` watches.

It also installs a `launchd` agent so the streamer survives logout/reboot.

## Prerequisites

Install GStreamer + the AWS KVS producer SDK plugin once on the device:

```sh
brew install gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad \
             gst-plugins-ugly gst-libav

# kvssink (build from source — there's no Homebrew formula). The official
# instructions live at:
# https://github.com/awslabs/amazon-kinesis-video-streams-producer-sdk-cpp
# After build, copy libgstkvssink.dylib into ~/Library/GStreamer/1.0/plugins/.
```

Verify with `gst-inspect-1.0 kvssink` — should print plugin metadata.

## Deployment settings (no rebuild required)

The app reads `apiUrl`, `region`, and optional Cognito IDs from a JSON settings
file at launch. The first non-empty source wins:

1. environment variables: `IVA_API_URL`, `IVA_REGION`, `IVA_USER_POOL_ID`, `IVA_USER_POOL_CLIENT_ID`
2. `~/Library/Application Support/IVA/settings.json`
3. `Contents/Resources/settings.json` bundled inside `IVA.app`
4. fall back to the user typing it into the registration UI

Copy `settings.example.json` to wherever fits your distribution:

```sh
mkdir -p "$HOME/Library/Application Support/IVA"
cp settings.example.json "$HOME/Library/Application Support/IVA/settings.json"
# edit the file to point at your sst deploy output
```

When the API URL is supplied this way, the registration screen shows it as
read-only — the user only pastes the registration token and picks a camera.

## Build the app

```sh
open IVA.xcodeproj          # or: swift build
```

The Swift sources are in `IVA/`. There's no Xcode project committed; create a
new macOS app target in Xcode named "IVA" and drop the `IVA/` folder onto it,
or build with SwiftPM via `swift build` from this directory (Swift 5.9+).

## How it works

```
                   ┌────────────────────────────────────┐
  registration ──▶ │  IVAApp        Backend.swift        │
  token (paste)    │     │             /agents/exchange  │
                   │     ▼                               │
                   │  KVSCreds  ──▶ writes creds file    │
                   │     │                               │
                   │     ▼                               │
                   │  StreamingAgent ──▶ gst-launch-1.0  │──▶  KVS PutMedia
                   └────────────────────────────────────┘
```

Config + creds are stored in `~/Library/Application Support/IVA/`:

- `config.json` — { deviceId, streamName, region, refreshToken, cameraUid }
- `credentials` — kvssink-style credential file with current STS access keys
- `agent.log` — gst-launch stdout/stderr

## LaunchAgent install

`Scripts/install-launchagent.sh` writes a plist to
`~/Library/LaunchAgents/tech.sp33c.iva.plist` that runs the agent at login.
