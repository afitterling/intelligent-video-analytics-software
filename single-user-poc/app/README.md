# IVA Camera (Expo, iOS)

An Expo dev-client app that captures frames from the iPhone camera and POSTs
them as JPEG to the IVA backend's `POST /ingest?cameraId=…` endpoint.

## iOS reality check

| Goal                                | Status on iOS                                              |
| ----------------------------------- | ---------------------------------------------------------- |
| Stream while app is in foreground   | ✅ Works.                                                  |
| Prevent auto-lock while streaming   | ✅ `expo-keep-awake` keeps the screen on indefinitely.     |
| Record while screen is **locked**   | ❌ Not possible. iOS revokes camera access on lock.        |
| Record while app is **backgrounded**| ⚠️ Best effort via `UIBackgroundModes: audio` + a silent looping audio source. Apple may reject this on App Store review; works for sideloaded/internal builds. |
| Open the app remotely               | ⚠️ Push wakes the app briefly. User must tap to foreground; iOS does not allow programmatic launch-to-foreground. |

The practical pattern is: **start streaming, leave the phone face-down on a
charger, screen stays on, app keeps streaming**. To "wake" it remotely, send a
push (visible alert) and tap it.

## Setup

```bash
cd app
npm install
npx expo prebuild --platform ios --clean   # generates the ios/ project
npx expo run:ios                           # build + install to a real device
```

Open Settings inside the app and paste the SST `api` output, e.g.
`https://xxxxx.execute-api.eu-west-1.amazonaws.com`. Pick a `cameraId` (e.g.
`iphone-livingroom`). Tap **Start streaming**.

## Silent-audio asset

`assets/silence.m4a` is bundled — a 2 s silent AAC file used to keep the audio
session alive in background. Regenerate (on macOS) with:

```bash
python3 -c "import wave; w=wave.open('/tmp/s.wav','wb'); w.setnchannels(1); \
  w.setsampwidth(2); w.setframerate(44100); w.writeframes(b'\\x00\\x00'*88200); w.close()"
afconvert -f mp4f -d aac /tmp/s.wav app/assets/silence.m4a
```

## Remote wake (push)

The app prints its APNs device token on the home screen. To trigger a wake from
your backend, send an APNs push with `content-available: 1` (silent) or an
alert payload that the user can tap. Hook this up to SNS/SES or call APNs
directly. (No backend route exists yet for device-token registration — add one
if you want this productionized.)

## What gets posted

Each frame: `POST {apiUrl}/ingest?cameraId={id}` with
`Content-Type: image/jpeg` and a base64-encoded JPEG body. This matches what
`backend/packages/functions/src/ingest.ts` accepts (it handles
`isBase64Encoded` transparently via API Gateway).
