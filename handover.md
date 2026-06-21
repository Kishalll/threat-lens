# ThreatLens Handoff

Created: 2026-06-21
Repo: `/home/gigabyte/threat-lens`
Related prior artifact: `/tmp/threatlens_notification_handoff.md`

## Purpose

This handoff is for the next agent/session to continue from the current known-good state.

Main goals already covered in this session:

- Restore and stabilize ThreatLens notification interception across:
  - foreground
  - background
  - swiped-away / killed-by-recents state
- Fix stacked-message handling for messaging notifications
- Fix cold-start notification back navigation
- Verify current notification behavior on the user's physical device
- Build a cleanup/refactor plan for dirty code without changing app functionality

Main goal for next session:

- Drive a controlled cleanup/refactor of dirty areas in `scan`, `breach`, and `protect` while preserving current behavior exactly

## User / Device Context

- User tests on: `Moto Edge 60 Pro`
- Platform: Android
- Important killed-state definition:
  - `killed` means `swiped away from recents`
  - not Android `Force stop`
- Testing device was connected via USB during some runs
- Final real acceptance for notification behavior should still be tested unplugged

## Frozen Product Requirements

The user clarified the intended behavior and these should now be treated as locked requirements unless they explicitly change them.

### Scan History

Scan history must include everything, in the order scans happened:

- manual scans
- foreground intercepted scans
- background intercepted scans
- killed-state intercepted scans

This history must survive app relaunch for all of the above.

### SAFE Auto Scans

SAFE auto-intercepted scans should also be stored silently in history.

### Score

Keep the current scoring behavior exactly as-is.

### Breach Removal Behavior

When a monitored credential is removed, related breach cards and guidance should disappear immediately, exactly as they do now.

### Protect Scope

Protect scope stays exactly:

- sign image
- verify signed image
- trust/settings management

### Android Protected Folder

Keep current Android protected-folder behavior as-is.

## Current High-Level Architecture

### Tabs / Product Areas

- Home / dashboard: `app/(tabs)/index.tsx`
- Breach: `app/(tabs)/breach.tsx`
- Scan: scanner-related routes and stores
- Protect / Shield: `app/(tabs)/shield.tsx`

### Important Modules

- Notification foreground interception:
  - `src/modules/notificationBridge.ts`
- Android native/plugin source of truth:
  - `withThreatLensConfig.js`
- Headless notification task:
  - `src/tasks/notificationTask.ts`
- Notification deep-link / alert sending:
  - `src/services/notificationService.ts`
- Scan history state:
  - `src/stores/scannerStore.ts`
- Dashboard score / suggestions:
  - `src/stores/dashboardStore.ts`
- Breach domain/state:
  - `src/stores/breachStore.ts`
  - `src/services/backgroundTasks.ts`
- SQLite persistence:
  - `src/services/storageService.ts`
- Shield / image trust:
  - `app/(tabs)/shield.tsx`
  - `src/services/imageTrustService.ts`

### Existing Prior Analysis

For older investigation details before the latest notification fixes, see:

- `/tmp/threatlens_notification_handoff.md`

That earlier doc is still useful for historical reasoning, but the current session supersedes it for the latest working state.

## Notification Problems Encountered In This Session

The user originally reported that notification behavior had become inconsistent after repeated edits and timeout-interrupted attempts.

Key problems encountered:

1. Background / killed-state notification interception had regressed
2. Current dirty native rewrite had diverged from the original JS path
3. Stacked WhatsApp notifications were being classified as combined unread text instead of latest unread message
4. Cold-start tap on scan alert opened the result screen, but Android back exited the app instead of returning to Scanner
5. User saw a `Unable to activate keep awake` error during app open after some flows

## Notification Fixes Implemented

### 1. Hybrid Notification Architecture

The biggest fix was to stabilize the notification architecture around three distinct execution modes:

- foreground active app -> JS foreground listener handles it
- app alive in background -> headless JS path handles it
- app swiped away / process dead -> native fallback handles it

This replaced the risky state where the native rewrite was effectively taking over too much of the background flow.

### 2. Restored Headless Background Path

Background notification handling was restored so normal background interception goes through the intended JS headless route rather than overusing the native-only path.

### 3. Native Pending Scan Bridge

Killed-state recovery relies on a native pending-scan handoff so scan results can survive until the app is opened again.

Important design outcome:

- do not rely on `expo-sqlite` from headless JS
- native bridge/file is the transport for killed-state persistence
- SQLite is the durable JS-side store once the app is alive again

### 4. Startup Recovery

On app open, pending native scans are consumed and recorded into app state/history.

Current intent after user clarifications:

- all scan sources should eventually persist and survive relaunch
- not only killed-state scans

This is still a refactor/cleanup follow-up area because scan persistence is currently uneven.

### 5. Stacked Messaging Notification Fix

Problem:

- for stacked WhatsApp-style notifications, the app used the combined unread text
- this caused older unread content to be mixed into the latest scan

Fix applied:

- messaging notifications now prefer latest unread message only
- not the full unread stack

Approach:

- use latest `MessagingStyle` message where available
- fallback to last line from `EXTRA_TEXT_LINES`
- fallback to normal `EXTRA_TEXT`

### 6. Cold-Start Notification Back Navigation Fix

Problem:

- when the app was swiped away and the user opened a scan alert
- the result screen opened correctly
- but Android back exited the app instead of going to Scanner

Fix applied:

- notification-opened scan results are tagged with `source=notification`
- result screen checks for that source
- header back and Android hardware back now route to Scanner instead of calling raw `router.back()` in that case

### 7. Duplicate Protection

Worker-level duplicate suppression was added/improved for notification fallback paths to reduce duplicate alerts for the same logical message.

## Critical Background Bug Diagnosed With Device Logs

One of the key bugs during the session was:

- foreground worked
- background initially failed

Diagnosis found:

- the Android worker was running
- but it was incorrectly deciding the app was still `visible`
- so it skipped the background path

Observed log behavior during diagnosis:

- worker started
- worker logged that it was skipping because app was treated as visible

Root cause:

- process-importance based foreground/background detection was too fragile on the user's device

Fix:

- stop relying on that visibility heuristic
- store real JS `AppState` into native preferences
- make worker decisions based on that stronger signal

Result:

- background interception started working again after rebuild

## Testing / Verification Flow Used

### Device Testing

All meaningful notification verification was done against the user's real Android device, not just static code reading.

User-tested scenarios included:

- foreground risky WhatsApp message
- background app with home button
- swiped-away app from recents
- stacked-message scenarios
- cold-start tap from alert

### adb / logcat Workflow

We used `adb logcat` to distinguish:

- foreground JS path
- headless JS path
- native fallback path

Representative command pattern used during diagnosis:

```bash
adb logcat -d ReactNativeJS:V ReactNative:W Expo:W ActivityManager:I *:S | tail -n 200
```

This was especially useful for:

- confirming the worker actually ran
- confirming whether it skipped due to app-state logic
- separating notification-pipeline failures from unrelated Expo/dev noise

### What Was Verified

By the end of the notification fix work, the user reported the 3 core notification cases working:

- foreground
- background
- swiped away / killed

Stacked-message handling and cold-start back navigation were also retested and reported as working properly.

### Remaining Non-Blocking Error Observed

The user saw this error during one run:

- `Unable to activate keep awake`

Assessment from logs and repo analysis:

- likely Expo dev / Dev Launcher noise
- not the notification pipeline itself
- not the cause of intercept/classify/alert failures

This is worth cleaning later if needed, but it should not block scan/breach/protect refactoring.

## Current Behavioral Expectations For Notifications

These are the currently intended contracts:

### Interception

- foreground active app:
  - JS foreground listener handles notification
- background alive:
  - headless JS path handles notification
- swiped away:
  - native fallback handles notification if needed

### Classification Outcome

- classify as `SAFE`, `PROMO`, `SPAM`, `SCAM`, `PHISHING`
- dangerous/promotional cases can alert the user
- SAFE auto scans should still be stored silently in history

### Persistence

Desired final behavior:

- manual scans persist
- foreground intercepted scans persist
- background intercepted scans persist
- killed-state intercepted scans persist
- all survive relaunch
- all appear in history in performed order

### Deep Links

- tapping scan alert opens correct analysis screen
- tapping breach alert opens correct breach detail screen
- if result came from notification cold-start, back should land on Scanner, not exit

## Codebase Dirtiness Assessment

The worktree itself was clean when last checked, but the codebase has architectural dirtiness caused by repeated issue-fix edits over time.

This is not primarily about uncommitted code. It is about uneven structure, duplication, and fragile boundaries.

### Overall Assessment

Current assessment:

- `scan`: high dirtiness / highest risk area
- `breach`: moderate dirtiness / good cleanup target
- `protect`: moderate-to-high dirtiness in UI organization, lower risk if split carefully
- `dashboard`: moderate dirtiness due to mixed source-of-truth and derived-state logic
- `native plugin`: moderate dirtiness due to large string-generated native source and drift risk

### Dirty Area 1: Scan Flow Is Too Scattered

Scan behavior is split across:

- `src/modules/notificationBridge.ts`
- `src/tasks/notificationTask.ts`
- `withThreatLensConfig.js`
- `src/services/notificationService.ts`
- `src/stores/scannerStore.ts`
- startup routing/recovery in `app/_layout.tsx`
- persistence in `src/services/storageService.ts`

It works now, but responsibilities are spread out and easy to desynchronize.

### Dirty Area 2: Notification Rules Are Duplicated

Filtering/package heuristics exist in both JS and native paths.

This is a drift risk.

The recent regressions are a good example of what happens when:

- app-package logic
- extraction logic
- dedup rules
- app-state rules

are not centralized or at least explicitly shared/contracted.

### Dirty Area 3: Breach Logic Is Duplicated

New-breach detection, persistence merge behavior, and alert decisions exist in both:

- `src/services/backgroundTasks.ts`
- `src/stores/breachStore.ts`

This should become one breach domain pipeline used by both UI-initiated and background runs.

### Dirty Area 4: Dashboard Store Does Too Much

`src/stores/dashboardStore.ts` currently mixes:

- raw state
- derived score
- color derivation
- suggestion tracking
- recomputation logic

This increases incidental complexity.

User explicitly wants current scoring preserved, so cleanup should preserve behavior while improving structure.

### Dirty Area 5: Shield Screen Is Monolithic

`app/(tabs)/shield.tsx` mixes:

- protect flow
- verify flow
- settings flow
- folder management
- trust state loading
- UI presentation
- side effects

This should be split without changing visible functionality.

### Dirty Area 6: Image Trust Service Has Debug Residue

`src/services/imageTrustService.ts` contains temporary debug logging around PEM parsing.

That is classic leftover debug residue and should be cleaned once behavior is protected.

### Dirty Area 7: Persistence Is Uneven

Current persistence is not yet expressed as a single clean model:

- some scan data is in SQLite
- some scan history is in Zustand memory
- killed-state transport uses native pending JSON
- breach persistence is more centralized

Final desired behavior for scans is now clear from the user, but implementation shape is still uneven.

### Dirty Area 8: No Automated Tests

There were no `test/spec` files found during this session.

That makes cleanup riskier and means the next agent should add a few small high-value behavior tests before large refactors.

## Locked Refactor Scope

The refactor must preserve exactly:

- current scoring behavior
- current breach credential-removal behavior
- current protect scope and Android folder behavior
- current notification functionality across foreground/background/swiped-away
- current deep-link behavior for breach and scan
- scan history including all scan sources, persisted across relaunch
- SAFE auto-intercepted scans silently recorded in history

## Recommended Cleanup Strategy

The next session should treat this as a behavior-preserving refactor, not a feature rewrite.

### Phase 1: Freeze Current Behavior

Before cleanup:

- write down the behavioral contract for breach / scan / protect
- create a manual QA checklist based on the now-working flows
- especially protect scan notification behavior with a regression checklist

### Phase 2: Remove Debug Residue

- remove temporary debug logs and stale workaround comments
- especially in `src/services/imageTrustService.ts`
- keep useful structured logs only

### Phase 3: Clean Breach First

This is the safest cleanup entry point.

Goal:

- extract one breach domain service that handles:
  - fetch from providers
  - merge with previous cached breaches
  - preserve guidance / resolution state
  - detect new breaches
  - build notification payloads

Then:

- make both `backgroundTasks.ts` and `breachStore.ts` use that same service

### Phase 4: Split Shield / Protect UI

Split `app/(tabs)/shield.tsx` into separate panels/modules:

- Protect
- Verify
- Trust settings

Keep:

- same visible flows
- same settings behavior
- same Android folder behavior

### Phase 5: Simplify Dashboard Ownership

Keep score math exactly the same, but separate:

- raw inputs
- derived selectors
- recomputation helpers

Do not change product scoring semantics.

### Phase 6: Refactor Scan Last

Scan is now working and is the highest-risk area.

Only refactor it after:

- behavior contract is written
- QA script exists
- a few high-value tests exist

Cleanup goals for scan:

- centralize scan persistence contract
- centralize shared scan policy / classification eligibility rules
- reduce duplication between foreground/headless/native flows
- keep native extraction where it must stay native
- keep JS/native contracts explicit

### Phase 7: Normalize Scan Persistence

Desired end-state based on user requirements:

- all scan types persist durably
- scan history is loaded on startup
- ordering is preserved
- dedup is correct
- SAFE auto scans are included silently

This likely means introducing a clearer scan repository/service boundary on top of SQLite and making `scannerStore` thinner.

### Phase 8: Improve Plugin Maintainability

`withThreatLensConfig.js` is the committed source of truth for generated Android code.

Cleanup goals:

- better internal structure for plugin-generated source
- safer sync workflow with generated Kotlin
- document native generation expectations clearly

Do not destabilize working native behavior during this phase.

## Suggested Tiny-Commit Sequence

1. Add behavior contract + QA checklist for breach/scan/protect
2. Remove debug residue and stale comments
3. Extract breach merge/new-alert service
4. Switch breach store to breach domain service
5. Switch background breach task to same breach domain service
6. Extract Shield Protect panel
7. Extract Shield Verify panel
8. Extract Shield Settings panel/hooks
9. Extract dashboard selectors and score helpers without changing logic
10. Add small high-value tests for breach/notification/persistence contracts
11. Extract shared scan policy helpers where safe
12. Extract scan repository / persistence helpers
13. Thin `scannerStore`
14. Clean plugin structure in `withThreatLensConfig.js`
15. Run full device regression on all 3 product areas

## Manual QA Checklist For Next Session

### Scan

- manual scan result appears in history
- foreground intercepted scan appears in history
- background intercepted scan appears in history
- killed-state intercepted scan appears in history
- SAFE auto scan appears silently in history
- history survives relaunch
- history order reflects scan execution order
- tapping scan alert opens correct result
- backing from cold-start result returns to Scanner
- stacked WhatsApp unread notifications classify latest message only

### Breach

- add credential
- run breach scan
- new breach notification opens correct breach view
- remove monitored credential and verify related breach cards/guidance disappear immediately
- keep current scoring behavior unchanged

### Protect / Shield

- protect image
- save protected image
- verify signed image
- settings load and save correctly
- Android protected folder behavior remains unchanged

## Notes On Testing Philosophy

There are no meaningful automated tests in repo yet.

Best immediate tests to add:

- breach merge/new-detection service tests
- scan repository/persistence contract tests
- notification deep-link builder tests
- score selector tests that preserve existing behavior
- image trust pure helper tests where stable

Avoid low-value snapshot tests.

## Commands / Tooling Notes

Useful commands used in this session:

Rebuild Android after native/plugin changes:

```bash
npx expo run:android
```

Regenerate Android project from Expo config plugin changes:

```bash
npx expo prebuild --platform android --no-install
```

Representative adb log capture:

```bash
adb logcat -d ReactNativeJS:V ReactNative:W Expo:W ActivityManager:I *:S | tail -n 200
```

## Suggested Skills For Next Agent

- `improve-codebase-architecture`
  - for the broader cleanup pass once behavior contracts are written
- `request-refactor-plan`
  - if converting the cleanup plan into tracked tiny commits / issue form
- `diagnose`
  - if any notification regression reappears during refactor
- `review`
  - after refactor branches to verify standards/spec and regression risk

## Final State Summary

Current product state at handoff:

- notification interception works again in:
  - foreground
  - background
  - swiped-away state
- stacked message handling was fixed
- cold-start alert back navigation was fixed
- Expo keep-awake error was assessed as likely dev-only noise
- user clarified final product expectations for history, SAFE scan storage, scoring, breach removal behavior, and protect scope
- repo still needs a structured cleanup pass because the codebase is functionally working but architecturally dirty, especially in scan flow distribution and duplication

