# ThreatLens

ThreatLens is an Expo React Native app for personal digital safety.

## Quick Setup 

### Maintainer (one-time backend bootstrap)

Run once per project (or when rotating keys/redeploying):

```powershell
npm run setup:cloud -- -ProjectId YOUR_GCP_PROJECT_ID -WriteEnv
```

Optional for shared dev backend without API-key auth:

```powershell
npm run setup:cloud -- -ProjectId YOUR_GCP_PROJECT_ID -DisableApiKeyAuth -WriteEnv
```

What this script does:

1. Enables required Google Cloud APIs
2. Ensures Firestore exists
3. Generates master key pair if missing
4. Stores secrets in Secret Manager
5. Deploys `register` and `verify` functions
6. Writes local `.env` and `.setup/generated/trust-config.json`

### Contributor (new machine or next install)

```powershell
npm run setup:local
```

Then run the app:

```powershell
npx expo run:android
npx expo start --dev-client
```

The script:

1. Creates `.env` from `.env.example` if missing
2. Applies generated backend config if available
3. Installs npm dependencies

This README is for a first-time contributor who just cloned the repo and wants to run the app using either:

1. Expo Go on a physical phone
2. Android Studio emulator on desktop (Windows or macOS)

## What You Need

1. Node.js 18+ (Node.js 20 LTS recommended)
2. npm 
3. Git
4. Android Studio (for Android emulator flow)
5. JDK 17 (required for Android build toolchain)

## 1. Clone And Install

```bash
git clone https://github.com/Kishalll/threat_lens.git
cd threat_lens
npm install
```

## 2. Create Environment File

Create a file named `.env` in project root.

Tip: this is automatic if you run `npm run setup:local`.

```dotenv
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL=https://us-central1-your_project_id.cloudfunctions.net
EXPO_PUBLIC_TRUST_REGISTRY_API_KEY=your_registry_api_key
EXPO_PUBLIC_MASTER_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

For backend deployment details (`/register` + `/verify`, Firestore, cert setup), see [cloud-function/README.md](cloud-function/README.md).

Automated setup scripts are available in [scripts/setup](scripts/setup).

If you change `.env`, restart Metro with cache clear:

```bash
npx expo start -c
```

## 3. Run On Phone With Expo Go

Use this for fastest testing loop.

1. Install Expo Go on your phone.
2. Connect laptop and phone to the same Wi-Fi network.
3. Start the project:

```bash
npx expo start
```

4. Scan the QR code from Expo Go.

If the phone cannot connect, run tunnel mode:

```bash
npx expo start --tunnel
```

Note: Expo Go does not include custom native modules from this app, so native notification interception features are limited in Expo Go.

## 4. Run On Android Studio Emulator (Windows)

### 4.1 Install Android SDK Components

In Android Studio, open SDK Manager and install:

1. Android SDK Platform (API 34 or newer)
2. Android SDK Build-Tools
3. Android SDK Platform-Tools
4. Android SDK Command-line Tools (latest)
5. Android Emulator

### 4.2 Set Environment Variables (Permanent)

Set User variables:

1. `JAVA_HOME` = `C:\Users\<your-user>\.jdk\jdk-17.x.x`
2. `ANDROID_HOME` = `C:\Users\<your-user>\AppData\Local\Android\Sdk`
3. `ANDROID_SDK_ROOT` = `C:\Users\<your-user>\AppData\Local\Android\Sdk`

Add to User `Path`:

1. `%JAVA_HOME%\bin`
2. `%ANDROID_HOME%\platform-tools`
3. `%ANDROID_HOME%\emulator`
4. `%ANDROID_HOME%\cmdline-tools\latest\bin`

Open a new terminal and verify:

```powershell
java -version
adb version
emulator -list-avds
```

### 4.3 Create Emulator And Run

1. Android Studio > Device Manager > Create device > Start it.
2. From project root:

```powershell
npx expo run:android
```

3. In a second terminal:

```powershell
npx expo start --dev-client
```

4. Press `a` to open on the running emulator.

## 5. Run On Android Studio Emulator (macOS)

### 5.1 Install Android SDK Components

In Android Studio, install the same components listed in the Windows section.

### 5.2 Set Environment Variables (zsh)

Add this to `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
```

Apply and verify:

```bash
source ~/.zshrc
java -version
adb version
emulator -list-avds
```

### 5.3 Create Emulator And Run

1. Android Studio > Device Manager > Create device > Start it.
2. From project root:

```bash
npx expo run:android
```

3. In a second terminal:

```bash
npx expo start --dev-client
```

4. Press `a` to open on the running emulator.

## 6. Common Issues

### `adb` not recognized

Android SDK paths are missing from `Path`. Add platform-tools and open a new terminal.

### Java 8 is being used instead of Java 17

Move Java 17 path above old Java paths in `Path`, then reopen terminal.

### No Android devices found

Start emulator first, then run `adb devices` and retry `npx expo run:android`.

### Linking scheme warning

Already configured in `app.json` with `scheme: threatlens`.

## 7. Security Notes

1. Never commit `.env`.
2. If any API key is exposed, rotate it immediately.
3. Never commit `master_private.pem`; store it in Google Secret Manager only.
