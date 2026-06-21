import { NativeModules, Platform } from "react-native";
import { classifyMessage } from "../services/nimService";
import { sendLocalNotification } from "../services/notificationService";
import { useScannerStore } from "../stores/scannerStore";
import { log } from "../utils/activityLog";
import type { ScanResult } from "../types";

const DANGEROUS = new Set(["SPAM", "SCAM", "PHISHING"]);

const ALLOWED_PACKAGES = new Set([
  "com.whatsapp", "com.whatsapp.w4b",
  "com.google.android.apps.messaging", "com.android.mms",
  "com.samsung.android.messaging", "org.telegram.messenger",
  "org.thoughtcrime.securesms", "com.facebook.orca",
  "com.google.android.gm", "com.microsoft.office.outlook",
  "com.instagram.android", "com.discord", "com.viber.voip",
  "com.skype.raider", "com.microsoft.teams",
]);

type TaskData = {
  packageName?: string;
  title?: string;
  text?: string;
  isTruncated?: boolean;
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
  const { packageName = "", title = "", text = "", isTruncated = false } = taskData;

  if (!ALLOWED_PACKAGES.has(packageName.toLowerCase())) return;

  if (isTruncated) {
    const clipped = text.trim().slice(0, 120);
    log("paste_prompt", `truncated notif from ${packageName} [headless]`);
    await sendLocalNotification(
      "Action Needed: Paste Full Message",
      `ThreatLens couldn't read the full message from ${title || packageName}. Tap to paste it in Scanner.`,
      { type: "PASTE_FULL_NOTIFICATION_PROMPT", sourcePackage: packageName, capturedText: clipped, threatlensInternal: true }
    );
    return;
  }

  if (!text.trim()) return;

  try {
    log("intercepted", `${packageName} [headless] | "${text.slice(0, 60)}"`);
    const result = await classifyMessage(text);
    if (result.classification === "UNAVAILABLE") return;

    log("classified", `${result.classification} (${result.confidence}%) from ${packageName} [headless]`);
    useScannerStore.getState().recordBackgroundScan(result);
    await persistPendingScan(result);

    const encodedResult = btoa(unescape(encodeURIComponent(JSON.stringify(result))));

    if (result.classification === "PROMO") {
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
