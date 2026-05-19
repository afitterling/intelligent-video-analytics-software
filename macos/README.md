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

### 1. GStreamer runtime

```sh
brew install gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad \
             gst-plugins-ugly gst-libav
```

### 2. Build deps for kvssink

`kvssink` has no Homebrew formula — it must be built from source. These are
the build-time deps:

```sh
brew install cmake pkgconf openssl@3 log4cplus
```

Notes:
- Homebrew renamed `pkg-config` → `pkgconf`; install the latter.
- The upstream KVS docs still mention `openssl@1.1`, which Homebrew has
  removed. `openssl@3` works — pass it via `-DOPENSSL_ROOT_DIR` below.

### 3. Build and install kvssink

```sh
git clone --depth 1 \
  https://github.com/awslabs/amazon-kinesis-video-streams-producer-sdk-cpp.git \
  ~/src/kvs-producer-sdk-cpp
cd ~/src/kvs-producer-sdk-cpp
mkdir -p build && cd build
cmake .. \
  -DBUILD_GSTREAMER_PLUGIN=ON \
  -DBUILD_DEPENDENCIES=OFF \
  -DOPENSSL_ROOT_DIR="$(brew --prefix openssl@3)"
make -j"$(sysctl -n hw.ncpu)"
```

The compile takes 5-15 minutes depending on the machine. It pulls in
`libkvspic` and `libkvscproducer` as in-tree dependencies via cmake's
`ExternalProject_Add`, so the first build is the slow one.

After build, several **wrinkles** need to be handled:

1. The plugin is built as `libgstkvssink.so` even on macOS (upstream
   CMakeLists doesn't pick `.dylib`). GStreamer's macOS loader only
   scans for `.dylib`, so it must be renamed.
2. The plugin links against `@rpath/libKinesisVideoProducer.dylib`,
   `@rpath/libcproducer.1.dylib`, and `@rpath/libkvsCommonCurl.1.dylib`.
   Those have to be co-located with the plugin or otherwise resolvable.
3. `~/Library/GStreamer/1.0/plugins/` is **not** in GStreamer's default
   scan path on a Homebrew install — only `/opt/homebrew/lib/gstreamer-1.0`
   is. Without `GST_PLUGIN_PATH` set, anything in `~/Library/GStreamer/`
   is silently ignored. Putting the plugin in the system dir means IVA
   finds it regardless of how it's launched (Finder, `open`, launchd).

Combined install:

```sh
SYS=/opt/homebrew/lib/gstreamer-1.0
BUILD=~/src/kvs-producer-sdk-cpp/build

# 1. Plugin itself (rename .so -> .dylib).
cp "$BUILD/libgstkvssink.so" "$SYS/libgstkvssink.dylib"

# 2. Transitive dylibs the plugin's @rpath links against.
cp "$BUILD/libKinesisVideoProducer.dylib" "$SYS/"
cp "$BUILD/dependency/libkvscproducer/kvscproducer-src/libcproducer.1.dylib" "$SYS/"
cp "$BUILD/dependency/libkvscproducer/kvscproducer-src/libcproducer.1.6.1.dylib" "$SYS/"
cp "$BUILD/dependency/libkvscproducer/kvscproducer-src/libkvsCommonCurl.1.dylib" "$SYS/"
cp "$BUILD/dependency/libkvscproducer/kvscproducer-src/libkvsCommonCurl.1.6.1.dylib" "$SYS/"

# 3. Re-sign the plugin (codesign invalidates when the binary is moved).
codesign --force --sign - "$SYS/libgstkvssink.dylib"

# 4. Clear GStreamer's plugin registry cache so it rescans next launch.
rm -rf ~/.cache/gstreamer-1.0
```

### 4. Verify

```sh
gst-inspect-1.0 kvssink | head
```

Should print:

```
Factory Details:
  ...
Plugin Details:
  Name                     kvssink
  Filename                 /opt/homebrew/Cellar/gstreamer/1.28.3/lib/gstreamer-1.0/libgstkvssink.dylib
```

## Troubleshooting

### `Kein Element »kvssink«` / `No such element or plugin 'kvssink'`

The KVS producer SDK plugin isn't where GStreamer looked. Either you
haven't built it (see step 3 above), or `libgstkvssink.dylib` and its
transitive dylibs aren't in `/opt/homebrew/lib/gstreamer-1.0/`. Confirm
with:

```sh
gst-inspect-1.0 --gst-plugin-path /path/to/build kvssink
```

If that works but a bare `gst-inspect-1.0 kvssink` fails, the plugin is
built correctly but installed in the wrong directory — move it to
`/opt/homebrew/lib/gstreamer-1.0/` along with the transitive dylibs
(`libKinesisVideoProducer.dylib`, `libcproducer.*`, `libkvsCommonCurl.*`).

### Noisy `objc[…]: Class … is implemented in both gtk+3 and gtk4` warnings

GStreamer's plugin scanner loads every `.dylib` under
`/opt/homebrew/lib/gstreamer-1.0`, which on a typical Homebrew install
includes both `libgstgtk` (gtk3) and `libgstgtk4`. macOS's Obj-C runtime
prints a warning when the same class symbol shows up in two dylibs in the
same process. The warnings are harmless — your pipeline does not use
either sink — but they clutter `agent.log`. Two ways to silence:

```sh
# Option A: blocklist the gtk sinks at the plugin level
export GST_PLUGIN_FEATURE_RANK=gtksink:NONE,gtkwaylandsink:NONE,gtk4paintablesink:NONE
```

```sh
# Option B: nuke them from the install (re-added by `brew upgrade gst-plugins-good`)
rm /opt/homebrew/lib/gstreamer-1.0/libgstgtk.dylib \
   /opt/homebrew/lib/gstreamer-1.0/libgstgtk4.dylib 2>/dev/null
rm -rf ~/.cache/gstreamer-1.0
```

### `pygobject initialization failed`

The Python GStreamer plugin (`libgstpython.dylib`) needs PyGObject
installed in the same Python that GStreamer was linked against. If you
don't use any Python-implemented GStreamer plugins, just blocklist it:

```sh
export GST_PLUGIN_FEATURE_RANK=python:NONE
```

Or delete `/opt/homebrew/lib/gstreamer-1.0/libgstpython.dylib`.

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
