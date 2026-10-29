// Filters shared by the in-app listener and the background task, so both
// paths skip the same noise before anything is sent for classification.

export const ALLOWED_MESSAGING_PACKAGES = new Set([
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
// Media notifications with no caption carry nothing to scan.
const MEDIA_ONLY_PATTERN = /^\W*(?:sent an? )?(?:sticker|photo|video|gif|audio|voice message|document|contact|location|live location)\b[\s\d:().]*$/i;

// Short messages that mention any of these are scanned anyway; lures are often brief.
const LURE_KEYWORDS = /kyc|otp|cvv|\bpin\b|password|lottery|prize|winner|verify|suspend|block|arrest|urgent|click|tap here|https?:|www\.|link|video|photo|claim|reward|account|bank|new number|refund|upi|gift|\bwon\b|job|invest|loan/i;

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

export function isLikelyMessagingPackage(packageName: string): boolean {
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

export function isNoiseText(title: string, text: string): boolean {
  const combined = `${title}\n${text}`.trim();
  if (!combined) {
    return true;
  }
  return IGNORED_TEXT_PATTERNS.some((pattern) => pattern.test(combined));
}

export function isLikelySystemOrServiceNotification(category: string, isOngoing: boolean): boolean {
  if (isOngoing) {
    return true;
  }

  const normalizedCategory = category.trim().toLowerCase();
  if (!normalizedCategory) {
    return false;
  }

  return SERVICE_NOTIFICATION_CATEGORIES.has(normalizedCategory);
}

export function isLowSignalNotification(packageName: string, title: string, text: string): boolean {
  const combined = `${title}\n${text}`.trim();
  if (!combined) {
    return true;
  }

  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(combined))) {
    return true;
  }

  const normalizedPackage = packageName.trim().toLowerCase();

  // Short casual message filter — only for messaging apps, not email
  if (MESSAGING_PACKAGES_WITH_SHORT_FILTER.has(normalizedPackage)) {
    const message = text.trim();
    if (MEDIA_ONLY_PATTERN.test(message)) {
      return true;
    }
    // Very short chat with no digits, unless it mentions a common lure.
    const wordCount = message.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 3 && !/\d/.test(message) && !LURE_KEYWORDS.test(message)) {
      return true;
    }
  }

  const packagePatterns = APP_SPECIFIC_LOW_SIGNAL_PATTERNS[normalizedPackage];
  if (Array.isArray(packagePatterns)) {
    return packagePatterns.some((pattern) => pattern.test(combined));
  }

  return false;
}
