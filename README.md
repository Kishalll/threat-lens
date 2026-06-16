# ThreatLens

ThreatLens is an Expo React Native app for personal digital safety. It lets you verify image authenticity, scan for threats, and monitor data breaches.

## Features

- Image trust verification with device-signed certificates
- AI-powered threat scanning via Gemini
- Data breach monitoring
- Background notification alerts

## Install

### Option 1 — Direct APK (Android)

Download the latest APK from [Releases](../../releases) and install it on your Android device.

Enable **Install unknown apps** on your device if prompted.

### Option 2 — Build from source

See [CONTRIBUTING.md](CONTRIBUTING.md) for full build and setup instructions.

## Environment

The app connects to a Cloudflare Workers backend for device trust registration. This is pre-configured in release builds. If you're building from source, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Security Notes

1. Never share or commit `.env`.
2. If any API key is exposed, rotate it immediately.
3. `master_private.pem` must stay in Cloudflare Workers secrets only — never commit it.
