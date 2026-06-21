import { NativeModules, NativeEventEmitter, Platform, AppState } from "react-native";
import { sendLocalNotification } from "../services/notificationService";
import { classifyMessage } from "../services/nimService";
import { useScannerStore } from "../stores/scannerStore";
import { log } from "../utils/activityLog";

// Get the native module
const { NotificationModule } = NativeModules;

// Exported as a mutable ref — assigned inside initializeNotificationInterceptor()
// so NativeEventEmitter is constructed after the native bridge is ready,
// not at module parse time.
export let notificationEmitter: NativeEventEmitter | null = null;

const DANGEROUS_CLASSIFICATIONS = new Set(["SPAM", "SCAM", "PHISHING"]);
const PROMO_CLASSIFICATION = "PROMO";
let interceptorRegistered = false;

const ALLOWED_MESSAGING_PACKAGES = new Set([
  // WhatsApp
  "com.whatsapp",
  "com.whatsapp.w4b",

  // SMS apps (common OEM + Google)
  "com.google.android.apps.messaging",
  "com.google.android.apps.googlevoice",
  "com.android.mms",
  "com.samsung.android.messaging",
  "com.sonyericsson.conversations",
  "com.miui.smsextra",
  "com.oneplus.mms",
  "com.oplus.message",
  "com.coloros.message",
  "com.vivo.messaging",
  "com.htc.sense.mms",
  "com.huawei.message",

  // Popular messaging apps
  "org.telegram.messenger",
  "org.telegram.plus",
  "org.thoughtcrime.securesms", // Signal
  "com.facebook.orca", // Messenger
  "com.instagram.android",
  "com.discord",
  "jp.naver.line.android",
  "com.tencent.mm", // WeChat
  "com.viber.voip",
  "com.kakao.talk",
  "com.zing.zalo",
  "com.skype.raider",
  "com.microsoft.teams",
  "com.bbm",

  // Email apps (for phishing detection requirement)
  "com.google.android.gm", // Gmail
  "com.microsoft.office.outlook",
  "com.yahoo.mobile.client.android.mail",
  "ch.protonmail.android",
  "com.samsung.android.email.provider",
  "com.sonyericsson.email",
  "com.tencent.androidqqmail",
  "com.my.mail",
  "com.readdle.spark",
]);

const IGNORED_PACKAGES = new Set([
  "android",
  "com.android.systemui",
  "com.android.incallui",
  "org.kde.kdeconnect_tp",
  "com.google.android.gms",
  "com.snapchat.android",

  // Shopping and commerce
  "in.amazon.mshop.android.shopping",
  "com.flipkart.android",
  "com.myntra.android",
  "com.meesho.supply",

  // Food and delivery
  "in.swiggy.android",
  "com.application.zomato",

  // Travel and utilities
  "com.olacabs.customer",
  "com.ubercab",
  "cris.org.in.prs.ima",
  "com.myairtelapp",
  "com.jio.myjio",
]);

const IGNORED_TEXT_PATTERNS = [
  /shared mobile data/i,
  /device connected/i,
  /checking for new messages/i,
  /checking for updates/i,
  /update available/i,
  /app updates? available/i,
  /\b\d+\s+apps?\s+(updated|installed|ready to update)\b/i,
  /\b(downloading|installing)\s+(update|updates|app|apps)\b/i,
  /\b(update|installation)\s+(complete|completed|successful)\b/i,
  /\b(app|apps)\s+(installed|uninstalled)\b/i,
  /is doing work in the background/i,
  /working in the background/i,
  /sync in progress/i,
  /syncing/i,
  /backup in progress/i,
  /usb debugging/i,
  /charging this device via usb/i,
  /ongoing call/i,
  /wi[- ]?fi hotspot on/i,
  /not connected to any device/i,
  /tap to view more options/i,
  /^android system$/i,
];

const LOW_SIGNAL_PATTERNS = [
  /\bis typing\b/i,
  /\breacted to your (message|story)\b/i,
  /\bmentioned you in a (story|post)\b/i,
  /\bstarted a call\b/i,
  /\bmissed (voice|video) call\b/i,
  /\bmissed call\b/i,
  /^new message$/i,
];

const TEAMS_LOW_SIGNAL_PATTERNS = [
  /\b(meeting|call) (starting|started|ended)\b/i,
  /\bjoin now\b/i,
  /\bscheduled (a )?meeting\b/i,
  /\breacted with\b/i,
  /\bchanged the (team|channel|group) (name|picture)\b/i,
  /\badded you to (a )?(team|channel|group)\b/i,
  /\bmentioned you in a channel\b/i,
];

const MESSENGER_LOW_SIGNAL_PATTERNS = [
  /\breacted to your message\b/i,
  /\bis active now\b/i,
  /\bstarted a call\b/i,
  /\bmissed (voice|video) call\b/i,
];

const INSTAGRAM_LOW_SIGNAL_PATTERNS = [
  /\bstarted following you\b/i,
  /\bliked your (post|photo|story|reel)\b/i,
  /\bcommented on your (post|reel)\b/i,
  /\bmentioned you in (their )?story\b/i,
  /\bsent you a reel\b/i,
  /\bposted to (their )?(story|reel)\b/i,
];

// Short casual messages with no digits or URLs — "did u commit", "ok", "wat r the changes"
// Applied to messaging apps only. Email packages are intentionally excluded so
// short subjects like "Your invoice is ready" still get classified.
const SHORT_MESSAGE_PATTERN = /^[^\d\n]{0,60}$/;

const MESSAGING_PACKAGES_WITH_SHORT_FILTER = new Set([
  "com.whatsapp",
  "com.whatsapp.w4b",
  "com.google.android.apps.messaging",
  "com.google.android.apps.googlevoice",
  "com.android.mms",
  "com.samsung.android.messaging",
  "com.sonyericsson.conversations",
  "com.miui.smsextra",
  "com.oneplus.mms",
  "com.oplus.message",
  "com.coloros.message",
  "com.vivo.messaging",
  "com.htc.sense.mms",
  "com.huawei.message",
  "org.telegram.messenger",
  "org.telegram.plus",
  "org.thoughtcrime.securesms",
  "com.facebook.orca",
  "com.instagram.android",
  "com.discord",
  "jp.naver.line.android",
  "com.tencent.mm",
  "com.viber.voip",
  "com.kakao.talk",
  "com.zing.zalo",
  "com.skype.raider",
  "com.microsoft.teams",
  "com.bbm",
]);

const APP_SPECIFIC_LOW_SIGNAL_PATTERNS: Record<string, RegExp[]> = {
  "com.microsoft.teams": TEAMS_LOW_SIGNAL_PATTERNS,
  "com.facebook.orca": MESSENGER_LOW_SIGNAL_PATTERNS,
  "com.instagram.android": INSTAGRAM_LOW_SIGNAL_PATTERNS,
};

const SERVICE_NOTIFICATION_CATEGORIES = new Set([
  "service",
  "status",
  "progress",
  "transport",
  "sys",
]);

const DUPLICATE_WINDOW_MS = 120_000;
const CLASSIFICATION_COOLDOWN_MS = 2_000;
const TRUNCATED_PROMPT_COOLDOWN_MS = 180_000;
const RETRY_PROMPT_COOLDOWN_MS = 300_000;

const recentFingerprints = new Map<string, number>();
const recentTruncatedPrompts = new Map<string, number>();
let lastClassificationAt = 0;
let lastRetryPromptAt = 0;
let classificationPausedUntil = 0;

type NativeNotificationEvent = {
  packageName?: string;
  title?: string;
  text?: string;
  isTruncated?: boolean;
  postedAt?: number;
  category?: string;
  isOngoing?: boolean;
};

function cleanupOldEntries(map: Map<string, number>, ttlMs: number, now: number): void {
  for (const [key, timestamp] of map.entries()) {
    if (now - timestamp > ttlMs) {
      map.delete(key);
    }
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isLikelyMessagingPackage(packageName: string): boolean {
  const normalized = packageName.trim().toLowerCase();
  if (!normalized || IGNORED_PACKAGES.has(normalized)) {
    return false;
  }

  if (ALLOWED_MESSAGING_PACKAGES.has(normalized)) {
    return true;
  }

  // Strict fallback for unknown OEM SMS package IDs.
  return normalized.includes(".mms") || normalized.endsWith(".sms");
}

function isNoiseText(title: string, text: string): boolean {
  const combined = `${title}\n${text}`.trim();
  if (!combined) {
    return true;
  }
  return IGNORED_TEXT_PATTERNS.some((pattern) => pattern.test(combined));
}

function isLikelySystemOrServiceNotification(category: string, isOngoing: boolean): boolean {
  if (isOngoing) {
    return true;
  }

  const normalizedCategory = category.trim().toLowerCase();
  if (!normalizedCategory) {
    return false;
  }

  return SERVICE_NOTIFICATION_CATEGORIES.has(normalizedCategory);
}

function isLowSignalNotification(packageName: string, title: string, text: string): boolean {
  const combined = `${title}\n${text}`.trim();
  if (!combined) {
    return true;
  }

  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(combined))) {
    return true;
  }

  const normalizedPackage = packageName.trim().toLowerCase();

  // Short casual message filter — only for messaging apps, not email
  if (MESSAGING_PACKAGES_WITH_SHORT_FILTER.has(normalizedPackage) && SHORT_MESSAGE_PATTERN.test(combined)) {
    // Never skip if it contains threat-indicative keywords
    const hasThreatKeyword = /kyc|otp|cvv|pin|password|lottery|prize|winner|verify|suspend|block|arrest|urgent|click here|tap here|http/i.test(combined);
    if (!hasThreatKeyword) {
      return true;
    }
  }

  const packagePatterns = APP_SPECIFIC_LOW_SIGNAL_PATTERNS[normalizedPackage];
  if (Array.isArray(packagePatterns)) {
    return packagePatterns.some((pattern) => pattern.test(combined));
  }

  return false;
}

function shouldClassify(
  packageName: string,
  title: string,
  text: string,
  category: string,
  isOngoing: boolean
): boolean {
  const now = Date.now();
  if (now < classificationPausedUntil) {
    return false;
  }

  if (!isLikelyMessagingPackage(packageName)) {
    return false;
  }

  if (isNoiseText(title, text)) {
    return false;
  }

  if (isLikelySystemOrServiceNotification(category, isOngoing)) {
    return false;
  }

  if (isLowSignalNotification(packageName, title, text)) {
    return false;
  }

  cleanupOldEntries(recentFingerprints, DUPLICATE_WINDOW_MS, now);

  const fingerprint = `${packageName.toLowerCase()}::${normalizeText(text)}`;
  const lastSeenAt = recentFingerprints.get(fingerprint);
  if (typeof lastSeenAt === "number" && now - lastSeenAt < DUPLICATE_WINDOW_MS) {
    return false;
  }

  if (now - lastClassificationAt < CLASSIFICATION_COOLDOWN_MS) {
    return false;
  }

  recentFingerprints.set(fingerprint, now);
  lastClassificationAt = now;
  return true;
}

function parseRetryAfterMs(message: string): number {
  const normalized = message.toLowerCase();

  const retryInMatch = normalized.match(/retry in\s+([\d.]+)s/);
  if (retryInMatch?.[1]) {
    const seconds = Number(retryInMatch[1]);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }

  const retryDelayMatch = normalized.match(/retrydelay\":\"([\d.]+)s/);
  if (retryDelayMatch?.[1]) {
    const seconds = Number(retryDelayMatch[1]);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }

  if (normalized.includes("quota exceeded")) {
    return 60_000;
  }

  if (normalized.includes("high demand") || normalized.includes("503")) {
    return 30_000;
  }

  return 0;
}

function shouldPromptForTruncated(packageName: string): boolean {
  const now = Date.now();
  cleanupOldEntries(recentTruncatedPrompts, TRUNCATED_PROMPT_COOLDOWN_MS, now);

  const normalizedPackage = packageName.toLowerCase();
  const lastPromptAt = recentTruncatedPrompts.get(normalizedPackage);
  if (typeof lastPromptAt === "number" && now - lastPromptAt < TRUNCATED_PROMPT_COOLDOWN_MS) {
    return false;
  }

  recentTruncatedPrompts.set(normalizedPackage, now);
  return true;
}

function shouldSendRetryPrompt(): boolean {
  const now = Date.now();
  if (now - lastRetryPromptAt < RETRY_PROMPT_COOLDOWN_MS) {
    return false;
  }
  lastRetryPromptAt = now;
  return true;
}

function buildCapturedPreview(text: string): { summary: string; capturedText: string } {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return {
      summary: "No message preview was captured.",
      capturedText: "",
    };
  }

  const clipped = normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
  return {
    summary: `Captured preview: \"${clipped}\"`,
    capturedText: clipped,
  };
}

async function promptForFullMessage(packageName: string, title: string, text: string) {
  const preview = buildCapturedPreview(text);
  await sendLocalNotification(
    "Action Needed: Paste Full Message",
    `ThreatLens could not read the full notification from ${title || packageName}. ${preview.summary} Tap to paste the complete text in Scanner.`,
    {
      type: "PASTE_FULL_NOTIFICATION_PROMPT",
      sourcePackage: packageName,
      sourceTitle: title,
      capturedPreview: preview.summary,
      capturedText: preview.capturedText,
      threatlensInternal: true,
    }
  );
}

function hasReadableText(text: string): boolean {
  return text.trim().length > 0;
}

function isExpectedClassificationDegrade(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("unable to analyse message at this time") ||
    normalized.includes("ai quota exceeded") ||
    normalized.includes("temporarily rate-limited") ||
    normalized.includes("rate-limited") ||
    normalized.includes("invalid api key") ||
    normalized.includes("flagged")
  );
}

function isScanCancelledError(message: string): boolean {
  return message.toLowerCase().includes("scan cancelled");
}

/**
 * Initializes the React Native listener that intercepts events from the Kotlin NotificationService
 */
export function initializeNotificationInterceptor() {
  if (Platform.OS !== "android" || !NotificationModule) {
    console.warn("Notification interceptor is only supported on Android or NativeModule not found.");
    return;
  }

  if (interceptorRegistered) {
    return;
  }

  // Create the emitter here, not at module load time, so the native bridge
  // is fully initialized before NativeEventEmitter tries to validate the module.
  try {
    notificationEmitter = new NativeEventEmitter(NotificationModule);
  } catch (e) {
    console.warn("Failed to create NativeEventEmitter for NotificationModule", e);
    return;
  }

  interceptorRegistered = true;

  console.log("Initializing React Native Notification Interceptor");

  notificationEmitter!.addListener("NotificationReceived", async (event: NativeNotificationEvent) => {
    // Only handle in foreground — background/killed state is handled by WorkManager → HeadlessJS
    if (AppState.currentState !== 'active') return;

    const packageName = typeof event.packageName === "string" ? event.packageName : "unknown-app";
    const title = typeof event.title === "string" ? event.title : "";
    const text = typeof event.text === "string" ? event.text : "";
    const isTruncated = event.isTruncated === true;
    const category = typeof event.category === "string" ? event.category : "";
    const isOngoing = event.isOngoing === true;

    try {
      log("native_event", `${packageName} | title="${title}" | text="${text.slice(0, 60)}"`);

      if (!isLikelyMessagingPackage(packageName)) {
        log("noise_filtered", `ignored package ${packageName}`);
        return;
      }

      if (isTruncated) {
        if (!shouldPromptForTruncated(packageName)) {
          log("dedup_skip", `truncated prompt cooldown for ${packageName}`);
          return;
        }
        log("paste_prompt", `truncated notif from ${packageName}`);
        await promptForFullMessage(packageName, title, text);
        return;
      }

      if (!hasReadableText(text)) {
        log("noise_filtered", `empty text from ${packageName}`);
        return;
      }

      if (isNoiseText(title, text)) {
        log("noise_filtered", `${packageName} | "${text.slice(0, 60)}"`);
        return;
      }

      if (isLikelySystemOrServiceNotification(category, isOngoing)) {
        log("noise_filtered", `service/system notification from ${packageName}`);
        return;
      }

      if (isLowSignalNotification(packageName, title, text)) {
        log("low_signal", `${packageName} | "${text.slice(0, 60)}"`);
        return;
      }

      const now = Date.now();
      cleanupOldEntries(recentFingerprints, DUPLICATE_WINDOW_MS, now);
      const fingerprint = `${packageName.toLowerCase()}::${normalizeText(text)}`;
      const lastSeenAt = recentFingerprints.get(fingerprint);
      if (typeof lastSeenAt === "number" && now - lastSeenAt < DUPLICATE_WINDOW_MS) {
        log("dedup_skip", `${packageName} | "${text.slice(0, 60)}"`);
        return;
      }

      if (now - lastClassificationAt < CLASSIFICATION_COOLDOWN_MS) {
        log("dedup_skip", `cooldown active for ${packageName}`);
        return;
      }

      if (!shouldClassify(packageName, title, text, category, isOngoing)) {
        return;
      }

      log("intercepted", `${packageName} | "${text.slice(0, 60)}"`);

      // Classify directly — bypasses scanner store so background scans never
      // conflict with or cancel an active manual scan in the UI.
      const scanResult = await classifyMessage(text);

      log("classified", `${scanResult.classification} (${scanResult.confidence}%) from ${packageName}`);

      // Also record into scanner store history so it shows up in scan history.
      await useScannerStore.getState().recordBackgroundScan(scanResult);

      // Encode result for deep link tap routing (same as headless path)
      const encodedResult = btoa(unescape(encodeURIComponent(JSON.stringify(scanResult))));

      if (scanResult.classification === PROMO_CLASSIFICATION) {
        log("alert_sent", `PROMO from ${packageName}`);
        await sendLocalNotification(
          "Promotional Message Detected",
          `A promotional message was received from ${packageName}.`,
          {
            type: "PROMO_ALERT",
            classification: scanResult.classification,
            sourcePackage: packageName,
            encodedResult,
            threatlensInternal: true,
          }
        );
        return;
      }

      if (!DANGEROUS_CLASSIFICATIONS.has(scanResult.classification)) {
        return;
      }

      log("alert_sent", `${scanResult.classification} from ${packageName}`);
      await sendLocalNotification(
        `Threat Alert: ${scanResult.classification}`,
        `Potential ${scanResult.classification.toLowerCase()} content detected from ${packageName}. Tap for full analysis.`,
        {
          type: "THREAT_ALERT",
          classification: scanResult.classification,
          sourcePackage: packageName,
          encodedResult,
          threatlensInternal: true,
        }
      );
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Automatic scan is temporarily unavailable.";

      if (isScanCancelledError(message)) {
        return;
      }

      if (isExpectedClassificationDegrade(message)) {
        const retryAfterMs = parseRetryAfterMs(message);
        classificationPausedUntil = Date.now() + (retryAfterMs > 0 ? retryAfterMs : 30_000);
        return;
      }

      console.error("Notification interception pipeline failed", error);

      const retryAfterMs = parseRetryAfterMs(message);
      if (retryAfterMs > 0) {
        classificationPausedUntil = Date.now() + retryAfterMs;
      }

      if (!shouldSendRetryPrompt()) {
        return;
      }

      await sendLocalNotification(
        "Threat Scan Unavailable",
        `${message} Tap to retry from Scanner.`,
        {
          type: "SCAN_RETRY_PROMPT",
          sourcePackage: packageName,
          sourceText: text,
          threatlensInternal: true,
        }
      );
    }
  });
}

export async function isNotificationAccessGranted(): Promise<boolean> {
  if (Platform.OS !== "android" || !NotificationModule?.isNotificationAccessGranted) {
    return false;
  }

  try {
    return await NotificationModule.isNotificationAccessGranted();
  } catch {
    return false;
  }
}

export function openNotificationAccessSettings(): void {
  if (Platform.OS !== "android" || !NotificationModule?.openNotificationAccessSettings) {
    return;
  }
  NotificationModule.openNotificationAccessSettings();
}

export async function getInitialSharedText(): Promise<string | null> {
  if (Platform.OS !== "android" || !NotificationModule?.getInitialSharedText) {
    return null;
  }

  try {
    const text = await NotificationModule.getInitialSharedText();
    return typeof text === "string" && text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}
