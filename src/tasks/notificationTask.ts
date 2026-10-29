import { AppState, NativeModules, Platform } from "react-native";
import { classifyMessage } from "../services/nimService";
import { sendLocalNotification } from "../services/notificationService";
import { useScannerStore } from "../stores/scannerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { log } from "../utils/activityLog";
import {
  isLikelyMessagingPackage,
  isLikelySystemOrServiceNotification,
  isLowSignalNotification,
  isNoiseText,
} from "../utils/notificationFilters";
import type { ScanResult } from "../types";

const DANGEROUS = new Set(["SCAM", "PHISHING"]);

type TaskData = {
  packageName?: string;
  title?: string;
  text?: string;
  isTruncated?: boolean;
  category?: string;
  isOngoing?: boolean;
};

async function persistPendingScan(result: ScanResult): Promise<void> {
  if (Platform.OS !== "android" || !NativeModules.NotificationModule?.appendPendingScan) {
    return;
  }

  try {
    await NativeModules.NotificationModule.appendPendingScan(JSON.stringify(result));
  } catch {
    // Persistence recovery is best-effort and should not block alert delivery.
  }
}

export default async function notificationTask(taskData: TaskData): Promise<void> {
  const { packageName = "", title = "", text = "", isTruncated = false, category = "", isOngoing = false } = taskData;

  // The in-app listener handles notifications while the app is open.
  if (AppState.currentState === "active") return;

  if (!isLikelyMessagingPackage(packageName) || !text.trim()) return;

  if (
    isNoiseText(title, text) ||
    isLikelySystemOrServiceNotification(category, isOngoing) ||
    isLowSignalNotification(packageName, title, text)
  ) {
    log("low_signal", `${packageName} [headless] | "${text.slice(0, 60)}"`);
    return;
  }

  try {
    // The app may have been started just for this task, before anything loaded settings.
    if (!useSettingsStore.getState().hydrated) {
      await useSettingsStore.getState().hydrate();
    }
    const { promoAlerts, pastePrompts } = useSettingsStore.getState().settings.scanner;

    log("intercepted", `${packageName} [headless] | "${text.slice(0, 60)}"`);
    const result = await classifyMessage(text);

    // A cut-off preview is only trusted when it already looks like a threat;
    // otherwise ask the user for the full text.
    if (isTruncated && !DANGEROUS.has(result.classification)) {
      if (!pastePrompts) {
        log("alert_skipped", `paste prompts off | ${packageName} [headless]`);
        return;
      }
      log("paste_prompt", `truncated notif from ${packageName} [headless]`);
      await sendLocalNotification(
        "Action Needed: Paste Full Message",
        `ThreatLens couldn't read the full message from ${title || packageName}. Tap to paste it in Scanner.`,
        { type: "PASTE_FULL_NOTIFICATION_PROMPT", sourcePackage: packageName, capturedText: text.trim().slice(0, 120), threatlensInternal: true }
      );
      return;
    }

    if (result.classification === "UNAVAILABLE") return;

    log("classified", `${result.classification} (${result.confidence}%) from ${packageName} [headless]`);
    await useScannerStore.getState().recordBackgroundScan(result);
    await persistPendingScan(result);

    const encodedResult = btoa(unescape(encodeURIComponent(JSON.stringify(result))));

    if (result.classification === "PROMO") {
      if (!promoAlerts) {
        log("alert_skipped", `promo alerts off | ${packageName} [headless]`);
        return;
      }
      log("alert_sent", `PROMO from ${packageName} [headless]`);
      await sendLocalNotification(
        "Promotional Message Detected",
        `A promotional message was received from ${packageName}.`,
        { type: "PROMO_ALERT", classification: result.classification, sourcePackage: packageName, encodedResult, threatlensInternal: true }
      );
      return;
    }

    if (!DANGEROUS.has(result.classification)) return;

    log("alert_sent", `${result.classification} from ${packageName} [headless]`);
    await sendLocalNotification(
      `Threat Alert: ${result.classification}`,
      `Potential ${result.classification.toLowerCase()} detected from ${packageName}. Tap for analysis.`,
      { type: "THREAT_ALERT", classification: result.classification, sourcePackage: packageName, encodedResult, threatlensInternal: true }
    );
  } catch {
    // Silently fail — don't crash the headless task
  }
}
