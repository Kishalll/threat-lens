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

### Physical device over Wi-Fi (wireless debugging)

Handy when the USB connection keeps dropping.

1. On the phone: Developer options > Wireless debugging > Pair device with pairing code.
2. Pair once, using the address and code from that pop-up:

```bash
adb pair 192.168.x.x:PAIR_PORT 123456
```

3. Connect, using the address under "IP address & Port" on the main Wireless debugging screen (a different port):

```bash
adb connect 192.168.x.x:CONNECT_PORT
adb reverse tcp:8081 tcp:8081
```

`adb reverse` lets the app load from Metro at `localhost`, so your firewall and Wi-Fi network don't get in the way.

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

## Native Code and Assets

The `android/` folder is generated and not committed. Its custom parts come from two places:

- `withThreatLensConfig.js` - the notification listener, worker, native module, notification icon and manifest entries. Edit the Kotlin templates here, not the files under `android/`; a prebuild overwrites those.
- `app.json` - app name, icons, splash and Android settings.

After changing either, regenerate and rebuild:

```bash
npx expo prebuild --platform android
npx expo run:android
```

App and notification icons are rendered from the SVGs in `assets/icon-source/`. After editing one, re-render the PNGs (needs `rsvg-convert` from librsvg) and run the prebuild above:

```bash
cd assets
rsvg-convert -w 1024 -h 1024 icon-source/icon.svg -o icon.png
rsvg-convert -w 1024 -h 1024 icon-source/adaptive-foreground.svg -o adaptive-icon.png
rsvg-convert -w 1024 -h 1024 icon-source/adaptive-background.svg -o adaptive-icon-background.png
rsvg-convert -w 1024 -h 1024 icon-source/adaptive-monochrome.svg -o adaptive-icon-monochrome.png
rsvg-convert -w 1024 -h 1024 icon-source/splash.svg -o splash-icon.png
rsvg-convert -w 48 -h 48 icon-source/icon.svg -o favicon.png
for d in mdpi:24 hdpi:36 xhdpi:48 xxhdpi:72 xxxhdpi:96; do
  rsvg-convert -w ${d##*:} -h ${d##*:} icon-source/notification.svg \
    -o notification-icon/drawable-${d%%:*}/ic_stat_threatlens.png
done
```

Colours come from `useTheme()` / `makeStyles()` in `src/hooks/useTheme.tsx`; don't hard-code colours, so both light and dark themes keep working.

---

## Before Opening a PR

```bash
npx tsc --noEmit
npm test
```

If you change how scanning, breaches, Shield or settings behave, update [docs/behavior-contracts.md](docs/behavior-contracts.md) in the same PR.

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

**White screen with "Reloading..."** - the dev build got stuck loading the JS bundle, often because a notification started the app in the background while Metro was down. Force stop it and open it again:

```bash
adb shell am force-stop com.anonymous.threatlens
```

**Red screen "Invalid UTF-8 continuation byte"** - the bundle download was cut off. Tap Reload.

**"Failed to connect to /192.168.x.x:8081" (EHOSTUNREACH)** - the phone can't reach Metro over Wi-Fi. Either load over USB or wireless debugging with `adb reverse tcp:8081 tcp:8081` and `npx expo start --dev-client --localhost`, or open port 8081 in your firewall (firewalld: `sudo firewall-cmd --zone=public --add-port=8081/tcp`).

**Phone disappears from `adb devices` or shows `offline`** - run `adb kill-server && adb devices`; if it stays offline, turn USB debugging off and on. Make sure only one `adb` is installed (`which -a adb`): two versions keep restarting each other's server. Wireless debugging (above) avoids USB drops altogether.

**New app icon doesn't show** - launchers cache icons. Remove and re-add the home-screen shortcut, or restart the launcher.
