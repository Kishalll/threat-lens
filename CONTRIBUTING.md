# Contributing to ThreatLens

## Prerequisites

- Node.js 20 LTS
- npm
- Git
- Android Studio + JDK 17 (for emulator builds)
- PowerShell (for setup scripts on Windows/macOS)

---

## Backend Setup (Maintainer, one-time)

The trust registry runs on Cloudflare Workers + D1. See [workers/README.md](workers/README.md) for full details.

Short version:

```bash
cd workers
npx wrangler login
npx wrangler d1 create threatlens_trust_registry
npx wrangler d1 execute threatlens_trust_registry --file=schema.sql
cat ../master_private.pem | npx wrangler secret put MASTER_PRIVATE_KEY_PEM --name threatlens-register
cat ../master_private.pem | npx wrangler secret put MASTER_PRIVATE_KEY_PEM --name threatlens-verify
npx wrangler deploy src/register.ts --name threatlens-register
npx wrangler deploy src/verify.ts --name threatlens-verify
```

Copy the output URLs into `.env`:

```dotenv
EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL=https://threatlens-register.YOUR_SUBDOMAIN.workers.dev
```

---

## Local Setup (Contributors)

```bash
git clone https://github.com/Kishalll/threat_lens.git
cd threat_lens
npm run setup:local
```

This creates `.env` from `.env.example` and runs `npm install`.

Fill in the missing values in `.env`:

```dotenv
EXPO_PUBLIC_NIM_API_KEY=your_nvidia_nim_api_key
EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL=https://threatlens-register.YOUR_SUBDOMAIN.workers.dev
EXPO_PUBLIC_TRUST_REGISTRY_API_KEY=your_registry_api_key
EXPO_PUBLIC_MASTER_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

If you change `.env`, restart Metro with cache clear:

```bash
npx expo start -c
```

---

## Running the App

### Physical device (recommended)

1. Enable USB debugging on your phone.
2. Connect via USB, verify with `adb devices`.
3. Build and install:

```bash
npx expo run:android --device
```
4. Start the dev server:

```bash
npx expo start --dev-client
```

### Android Studio Emulator (Windows)

1. Install in Android Studio SDK Manager: Platform API 34+, Build-Tools, Platform-Tools, Command-line Tools, Emulator.
2. Set environment variables:

| Variable | Value |
|---|---|
| `JAVA_HOME` | `C:\Users\<you>\.jdk\jdk-17.x.x` |
| `ANDROID_HOME` | `C:\Users\<you>\AppData\Local\Android\Sdk` |

Add to `Path`: `%JAVA_HOME%\bin`, `%ANDROID_HOME%\platform-tools`, `%ANDROID_HOME%\emulator`, `%ANDROID_HOME%\cmdline-tools\latest\bin`

3. Create and start a device in Android Studio > Device Manager.
4. Run:

```powershell
npx expo run:android
npx expo start --dev-client
```

### Android Studio Emulator (macOS)

Add to `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
```

Then:

```bash
source ~/.zshrc
npx expo run:android
npx expo start --dev-client
```

---

## Sharing a Test Build (EAS)

To share the app with testers without requiring a laptop:

```bash
npx eas build --platform android --profile preview
```

Outputs a download link. The `.env` values are baked in at build time — testers don't need to configure anything.

---

## Troubleshooting

**`adb` not recognized** — add `platform-tools` to `Path` and reopen terminal.

**Java 8 used instead of 17** — move Java 17 above older entries in `Path`.

**No devices found** — start emulator first, then run `adb devices` before retrying.

**`expo` version mismatch in Termux / CI** — run `npm install` first so `npx` picks the local version.


### ToDos

- [x] replace gemini w nim models
- [ ] tune model wrt indian scams
- [ ] remove keys in img config tab
- [ ] add concel btn to cancel and revert img protect
- [ ] improve text ui
- [ ] add an app settings menu w btn on top right - own api key, themes, notif interception toggle, app laguage(ai responds in mentioned lang)
- [ ] add app logo

