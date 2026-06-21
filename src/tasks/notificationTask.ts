import { classifyMessage } from "../services/nimService";
import { sendLocalNotification } from "../services/notificationService";
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

export default async function notificationTask(taskData: TaskData): Promise<void> {
  const { packageName = "", title = "", text = "", isTruncated = false } = taskData;

  if (!ALLOWED_PACKAGES.has(packageName.toLowerCase())) return;

  if (isTruncated) {
    const clipped = text.trim().slice(0, 120);
    await sendLocalNotification(
      "Action Needed: Paste Full Message",
      `ThreatLens couldn't read the full message from ${title || packageName}. Tap to paste it in Scanner.`,
      { type: "PASTE_FULL_NOTIFICATION_PROMPT", sourcePackage: packageName, capturedText: clipped, threatlensInternal: true }
    );
    return;
  }

  if (!text.trim()) return;

  try {
    const result = await classifyMessage(text);
    if (result.classification === "UNAVAILABLE") return;

    // Encode result as base64 so the tap can decode it without SQLite
    const encodedResult = btoa(unescape(encodeURIComponent(JSON.stringify(result))));

    if (result.classification === "PROMO") {
      await sendLocalNotification(
        "Promotional Message Detected",
        `A promotional message was received from ${packageName}.`,
        { type: "PROMO_ALERT", classification: result.classification, sourcePackage: packageName, encodedResult, threatlensInternal: true }
      );
      return;
    }

    if (!DANGEROUS.has(result.classification)) return;

    await sendLocalNotification(
      `Threat Alert: ${result.classification}`,
      `Potential ${result.classification.toLowerCase()} detected from ${packageName}. Tap for analysis.`,
      { type: "THREAT_ALERT", classification: result.classification, sourcePackage: packageName, encodedResult, threatlensInternal: true }
    );
  } catch {
    // Silently fail — don't crash the headless task
  }
}
