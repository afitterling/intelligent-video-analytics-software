# Intelligent Video Analytics (IVA)

Multi-user video analytics platform on AWS:

| Folder              | What it is                                                                                          |
|---------------------|-----------------------------------------------------------------------------------------------------|
| `infra/`            | SST app — Cognito user pool, per-device Kinesis Video Streams, DynamoDB, Rekognition, SES, Lambdas. |
| `web/`              | Remix app — signup/login/reset, device CRUD, AI rule editor, live HLS viewer.                       |
| `macos/`            | SwiftUI agent — paste registration token, pick camera, stream to KVS via `gst-launch` + `kvssink`.  |
| `mobile/`           | Expo Router app — same feature set as the web app, native iOS/Android.                              |
| `single-user-poc/`  | The earlier single-tenant prototype (kept for reference only).                                      |

## End-to-end flow

```
┌─ web/expo ──┐                 ┌──────────────── infra ────────────────┐
│  Cognito UI │  signup/login → │ /auth/* Lambda → Cognito user pool     │
│             │                 │                                       │
│  Devices    │  CRUD ────────► │ /devices Lambda → DynamoDB +          │
│             │                 │   creates one KVS stream per device   │
│             │  register-token │                                       │
│             │  ←────────────  │ /devices POST returns token (once)    │
│             │                 │                                       │
│  Rules      │  CRUD ────────► │ /rules Lambda → DynamoDB              │
│             │                 │                                       │
│  Viewer     │  GET HLS url ─► │ /devices/{id}/viewer-url              │
│             │                 │   → KVS GetHLSStreamingSessionURL     │
└─────────────┘                 └───────────────────────────────────────┘
       ▲                                              ▲
       │ HLS                                          │ Rekognition + SES
       │                                              │
       │                              ┌─────── EventBridge (every 1m) ─┐
       │                              │  Detector Lambda                │
       │                              │   for every active device:      │
       │                              │     KVS GetImages → Rekognition │
       │                              │     match user's rules          │
       │                              │     fire action (email/webhook) │
       │                              └─────────────────────────────────┘
       │
┌────  macos  ────┐
│ paste token,    │
│ pick AVCapture  │  POST /agents/exchange
│ camera          │ ──────────────────────────► STS creds + KVS endpoint
│                 │                            │
│ gst-launch-1.0  │  PutMedia (H.264, MKV)    │
│  ↳ avfvideosrc  │ ─────────────────────────► per-device KVS stream
│  ↳ x264enc      │
│  ↳ kvssink      │
└─────────────────┘
```

## Deploy order

```sh
# 1. infra
cd infra
npm install
npm run dev         # local watch mode, or: npm run deploy

# `sst dev` prints API URL + Cognito IDs. Save them.

# 2. web
cd ../web
cp .env.example .env       # fill IVA_API_URL + SESSION_SECRET
npm install
npm run dev                # http://localhost:5173

# 3. mobile
cd ../mobile
# Edit app.json -> expo.extra.apiUrl with the API URL from step 1.
npm install
npm run start              # then `i` for iOS sim, `a` for Android, `w` for web

# 4. macos
cd ../macos
brew install gstreamer gst-plugins-{base,good,bad,ugly} gst-libav
# Build & install kvssink: https://github.com/awslabs/amazon-kinesis-video-streams-producer-sdk-cpp
swift build -c release
open .                      # then open the IVA target in Xcode and run
```

## SES sandbox notice

The first deploy puts SES into sandbox mode for `info@sp33c.tech`. Verify the
recipient address(es) you want alerts to land at, or request production access.

## Reset / teardown

```sh
cd infra && npm run remove
```
