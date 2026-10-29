# ThreatLens

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-000020.svg?logo=expo&logoColor=white)](https://expo.dev/)
[![Platform: Android](https://img.shields.io/badge/Platform-Android-3DDC84.svg?logo=android&logoColor=white)](https://www.android.com/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020.svg?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![AI: NVIDIA NIM](https://img.shields.io/badge/AI-NVIDIA_NIM-76B900.svg?logo=nvidia&logoColor=white)](https://build.nvidia.com/)

ThreatLens is an Expo React Native app for personal digital safety. It helps you verify if images have been tampered with, scan messages for scams, and check if your credentials have been leaked in data breaches.

## Features

### Image Protection & Verification

This is the core feature. It lets you sign an image so anyone can later check that it hasn't been altered and where it came from.

**How it works:**

When you first use the app, it generates a unique key pair (P-256 ECDSA) for your device and registers it with the trust registry backend (Cloudflare Workers + D1). The backend signs a certificate binding your device identity to your public key, similar to how HTTPS certificates work, but for devices.

**Protecting an image:**

When you protect an image, the app:
1. Computes a SHA-256 hash of the raw pixels and a perceptual hash (dHash), a fingerprint of the visual content
2. Hides a 128-bit watermark in the image's frequency data (DCT): a 64-bit lookup ID plus the 64-bit perceptual hash
3. Signs a payload (device identity, certificate, hashes, timestamp) with your device's private key
4. Uploads the signed payload to the cloud image registry, keyed by the watermark

The watermark is invisible and survives normal JPEG saving. Nothing is stored in EXIF metadata. You can cancel while it runs; a cancelled run keeps nothing and uploads nothing.

**Verifying an image:**

The app reads the watermark from the image, then checks it locally and against the cloud registry. The cloud check always runs. You can cancel while it runs.

| Check | What it does |
|---|---|
| Watermark | Finds the hidden DCT watermark; without one the image was never protected |
| Tamper check | Compares the perceptual hash in the watermark with the image as it is now |
| Master cert check | Confirms the signing device's certificate came from the app's master key |
| Signature check | Verifies the ECDSA signature on the payload from the registry |
| Device check | Asks the registry whether the signing device is still active or was revoked |

**Possible results:**

| Result | What it means | Real-life trigger |
|---|---|---|
| `AUTHENTIC` | Every check passed | Image is as it was signed, by a real trusted install |
| `INTEGRITY_VERIFIED` | Pixels are intact, source not confirmed | No internet, or the registry has no record of the image |
| `TAMPERED` | Visual content changed after signing | Cropped, filtered, face-swapped or text added |
| `CLONE_APP` | Master certificate invalid | Signed by a fake or modified copy of the app |
| `INVALID_SIGNATURE` | Signature on the payload is broken | The registry record was altered or forged |
| `REVOKED` | Signing device revoked in the registry | The phone was stolen, compromised or removed from the registry |
| `NO_PROTECTION` | No watermark found | The image was never protected, or isn't a JPEG |
| `CORRUPT` | File unreadable, or device validation failed | Damaged file, or the registry rejected the device |

---

### Message Threat Scanner

Scans text messages, links, or anything suspicious for scams and phishing using NVIDIA NIM AI.

Three ways to scan:
- **Automatic** - grant notification access and the app reads incoming messages from WhatsApp, SMS, Telegram, Gmail, and other messaging apps, even when the app is closed. If a threat is detected, you get an alert notification instantly
- **Paste** - copy any message and paste it directly into the scanner
- **Share** - share text from any app directly into ThreatLens using Android's share sheet

Classifies as `SAFE`, `PROMO`, `SCAM`, or `PHISHING`, with a confidence score, red flags, and suggested actions. Tuned for the Indian context (UPI scams, OTP fraud, KYC phishing): bank alerts and OTPs that warn "do not share" are recognised as genuine. Multilingual - understands Hindi, Bengali, Tamil, Telugu, Marathi, and other major Indian languages. Falls back to a secondary NIM model if the primary is unavailable.

Short chit-chat ("ok", "hi"), stickers and media without a caption are skipped to save API calls. Short messages that mention a link, OTP, bank or similar are always scanned.

From the Scanner settings you can turn automatic scanning off, choose which apps are scanned, turn promo alerts and "paste the full message" prompts on or off, and choose how long scan history is kept.

---

### Data Breach Monitor

Checks if your email or username has appeared in known data breaches.

- Uses two sources: XposedOrNot and LeakCheck
- Shows which breach, when it happened, and what data was exposed
- Generates AI-powered recovery guidance via NVIDIA NIM for each breach
- Background checks every 6, 12 or 24 hours, with alerts when new breaches are found; both can be turned off

---

### Safety Dashboard

A home screen dashboard gives you an at-a-glance safety score (0–100) calculated from your current breach exposure, threat scan history, and how many images you've protected. The score updates as you act on suggestions — resolving breaches, protecting images, and following recommended actions all improve it.

---

### Settings and Personalisation

Every tab has a gear at the top right with its own settings.

- **Your own NVIDIA key** - paste and test your own NIM API key; every scan then uses it, even when the app is closed
- **Theme** - dark, light, or follow your phone
- **App lock** - fingerprint, face or phone PIN when you open the app or come back after 30 seconds
- **Clear all data** - wipes history, accounts, results and settings, but keeps your device identity and saved images
- **Swipe between tabs** - swipe left or right anywhere to move between Home, Scanner, Shield and Breaches

---

## Install

### Option 1 - Direct APK (Android)

Download the latest APK from [Releases](../../releases) and install it on your Android device.

Enable **Install unknown apps** if prompted.

### Option 2 - Build from source

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security Notes

1. Never commit `.env`.
2. If any API key is exposed, rotate it immediately.
3. `master_private.pem` must stay in Cloudflare Workers secrets only, never commit it.

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.

