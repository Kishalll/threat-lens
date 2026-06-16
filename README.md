# ThreatLens

ThreatLens is an Expo React Native app for personal digital safety. It helps you verify if images have been tampered with, scan messages for scams, and check if your credentials have been leaked in data breaches.

## Features

### Image Protection & Verification

This is the core feature. It lets you cryptographically sign an image so anyone can later verify it hasn't been altered.

**How it works:**

When you first use the app, it generates a unique key pair (P-256 ECDSA) for your device and registers it with the trust registry backend (Cloudflare Workers + D1). The backend signs a certificate binding your device identity to your public key — similar to how HTTPS certificates work, but for devices.

**Protecting an image:**

When you protect an image, the app:
1. Computes a SHA-256 hash of the raw pixel data
2. Computes a perceptual hash (dHash) — a fingerprint based on visual content
3. Signs all of this (plus your device identity, timestamp, certificate) with your private key
4. Embeds the signed payload into the image's EXIF metadata — no visible change to the image

The signed image looks identical. The proof is invisible, stored in the file itself.

**Verifying an image:**

When you verify an image, the app runs four checks in order:

| Check | What it does |
|---|---|
| Hash check | Recomputes SHA-256 of pixel data, compares to signed value |
| Signature check | Verifies the ECDSA signature using the embedded public key |
| Master cert check | Verifies the device certificate was signed by the app's master key |
| Cloud check | Calls the trust registry to confirm the device is still active and not revoked |

**Possible results:**

| Result | What it means | Real-life trigger |
|---|---|---|
| `AUTHENTIC` | All 4 checks passed | Image is exactly as captured, from a real trusted device |
| `TAMPERED` | Pixel hash mismatch | Someone edited the image — cropped, filtered, face-swapped, or added text after signing |
| `INVALID_SIGNATURE` | Crypto signature broken | Someone tampered with the EXIF payload itself, or built a fake one without a real private key |
| `CLONE_APP` | Master cert invalid | Image was signed by a fake or modified version of the app, not a real install |
| `REVOKED` | Device revoked in registry | Signing phone was stolen, compromised, or manually removed from the trust registry |
| `OFFLINE` | Cloud check unreachable | Local checks passed but no internet — device status couldn't be confirmed |

---

### Message Threat Scanner

Scans text messages, links, or anything suspicious for scams, phishing, and spam using Gemini AI.

Three ways to scan:
- **Automatic** — grant notification access and the app reads incoming messages from WhatsApp, SMS, Telegram, Gmail, and other messaging apps in the background. If a threat is detected, you get an alert notification instantly
- **Paste** — copy any message and paste it directly into the scanner
- **Share** — share text from any app directly into ThreatLens using Android's share sheet

Classifies as `SAFE`, `SPAM`, `SCAM`, or `PHISHING`, with a confidence score, red flags, and suggested actions. Tuned for the Indian context (UPI scams, OTP fraud, KYC phishing). Automatically falls back across multiple Gemini model versions if one is rate-limited.

---

### Data Breach Monitor

Checks if your email or username has appeared in known data breaches.

- Uses two sources: XposedOrNot and LeakCheck
- Shows which breach, when it happened, and what data was exposed
- Generates AI-powered recovery guidance via Gemini for each breach
- Background alerts notify you when new breaches are detected

---

### Safety Dashboard

A home screen dashboard gives you an at-a-glance safety score (0–100) calculated from your current breach exposure, threat scan history, and how many images you've protected. The score updates as you act on suggestions — resolving breaches, protecting images, and following recommended actions all improve it.

---

## Install

### Option 1 — Direct APK (Android)

Download the latest APK from [Releases](../../releases) and install it on your Android device.

Enable **Install unknown apps** if prompted.

### Option 2 — Build from source

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security Notes

1. Never commit `.env`.
2. If any API key is exposed, rotate it immediately.
3. `master_private.pem` must stay in Cloudflare Workers secrets only — never commit it.
