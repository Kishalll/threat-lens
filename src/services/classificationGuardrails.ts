import type { ScanResult } from "../types";

// Banks and apps add "never share your OTP/PIN" to almost every SMS. Strip that
// sentence before matching so the warning itself isn't read as a request.
const SAFETY_WARNING = /\b(?:never|do\s*not|don['’]?t|dont)\s+(?:share|disclose|tell|give)\b[^.!\n]*/gi;

const SHORTENER_LINK = /(?:^|[\s/(])(?:bit\.ly|tinyurl\.com|t\.co|shorturl\.at|goo\.gl|is\.gd|cutt\.ly|rb\.gy|tiny\.cc)\//i;
const ANY_LINK = /https?:\/\/|\bwww\.|\b[\w-]+\.(?:com|in|co|net|org|xyz|top|info|link|site|online|io|me)\b/i;
// Personal Indian mobile. Helplines start with 1 and UPI handles end in @, so both are skipped.
const PERSONAL_MOBILE = /(?:^|\D)(?:\+?91[\s-]?)?[6-9]\d{9}(?![\d@])/;
const URGENCY = /\b(?:immediately|urgent(?:ly)?|disconnect(?:ed|ion)?|blocked|arrest(?:ed)?|legal\s+action|police|cbi|customs)\b/i;

// Genuine threat indicators. Used to back up a SCAM/PHISHING verdict from the model.
const GENUINE_THREAT_PATTERNS: RegExp[] = [
  SHORTENER_LINK,
  /\b(?:share|send|enter|provide|give|reply\s+with|confirm)\s+(?:your|ur|the)?\s*(?:otp|one[-\s]?time\s?password|pin|cvv|password|card\s+(?:no|number|details)|bank\s+details)\b/i,
  /\bkyc\b|verify\s+(?:your\s+)?account|account\s+(?:has\s+been\s+|will\s+be\s+)?(?:suspended|blocked|deactivated)|reactivate/i,
  /\blottery\b|\bprize\b|\bwinner\b|gift\s?card|lucky\s+draw|you\s+(?:have\s+)?won\b/i,
  /digital\s+arrest|part[-\s]?time\s+job|work\s+from\s+home|earn\s+(?:rs\.?|₹|inr)?\s*[\d,]+\s*(?:daily|per\s+day|\/day)|guaranteed\s+returns?|double\s+your\s+money|(?:sent|transferred)\s+(?:by\s+)?mistake/i,
];

// Patterns that identify a transactional alert (bank/UPI/institution payment notification)
const TRANSACTIONAL_ALERT_PATTERNS: RegExp[] = [
  /(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d{1,2})?/i,                       // monetary amount
  /(?:a\/c|account|card)\s*(?:no\.?\s*)?(?:ending|[xX*]+)\s*\d{3,}/i, // masked account/card
  /ending\s+\d{4}/i,                                                  // card ending XXXX
  /\b(?:debited|credited|received|transferred|paid|successful)\b/i,   // transaction verbs
  /\b(?:ref|reference|txn|neft|imps|rtgs|upi\s*ref)\b/i,              // reference patterns
];

// Patterns that identify a delivery/shipment notification
const DELIVERY_NOTIFICATION_PATTERNS: RegExp[] = [
  /\b(?:delivered|dispatched|shipped|out for delivery|arriving|in transit)\b/i,
  /\b(?:order|package|parcel|shipment)\b.*\b(?:id|no|number|#)\b/i,
  /\bdelivery\s*otp\b/i,
  /\b(?:amazon|flipkart|myntra|swiggy|zomato|delhivery|bluedart|ekart|ecom\s*express)\b/i,
];

// Patterns that indicate credential harvesting (true threat in financial context)
const CREDENTIAL_REQUEST_PATTERNS: RegExp[] = [
  /\b(?:share|send|enter|provide|give|reply\s+with)\s+(?:your|ur)\b/i,
  /\b(?:verify|update|confirm|reactivate|complete)\s+(?:your|ur)?\s*(?:account|kyc|identity|details|pan|aadhaar)\b/i,
  /\b(?:suspended|blocked|deactivated|frozen)\b.*\b(?:click|tap|visit)\b/i,
  /\b(?:click|tap)\b.*\b(?:verify|reactivate|update|confirm|unblock)\b/i,
];

const CASUAL_SAFE_PATTERNS: RegExp[] = [
  /^(hi|hii|hello|hey|yo)[!.\s]*$/i,
  /^how are you[?.!\s]*$/i,
  /^are you free[?.!\s]*$/i,
  /^(come|let'?s)\s+(to\s+)?play[!.\s]*$/i,
  /^let'?s\s+meet[!.\s]*$/i,
  /^good\s+(morning|afternoon|evening|night)[!.\s]*$/i,
];

// The model's SCAM/PHISHING verdict is kept without regex backing only at or above this.
const UNBACKED_VERDICT_MIN_CONFIDENCE = 80;

function normalizeMessageText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripSafetyWarnings(text: string): string {
  return text.replace(SAFETY_WARNING, " ");
}

// Urgency only counts when there is someone to call or somewhere to click.
function hasUrgentContact(text: string): boolean {
  return URGENCY.test(text) && (PERSONAL_MOBILE.test(text) || ANY_LINK.test(text));
}

function countGenuineThreats(text: string): number {
  const count = GENUINE_THREAT_PATTERNS.filter((p) => p.test(text)).length;
  return hasUrgentContact(text) ? count + 1 : count;
}

function hasCredentialRequest(text: string): boolean {
  return CREDENTIAL_REQUEST_PATTERNS.some((p) => p.test(text));
}

// Anything here stops a message from being forced to SAFE as a transaction or delivery update.
function hasOverrideBlocker(text: string): boolean {
  return hasCredentialRequest(text) || SHORTENER_LINK.test(text) || hasUrgentContact(text);
}

function isLikelyCasualSafeMessage(text: string): boolean {
  if (!text || text.split(" ").filter(Boolean).length > 7) return false;
  return CASUAL_SAFE_PATTERNS.some((p) => p.test(text));
}

function isLikelyTransactionalAlert(text: string): boolean {
  // Needs at least 2 transactional signals (e.g. amount + masked account,
  // or amount + transaction verb) and nothing asking the user to act.
  return TRANSACTIONAL_ALERT_PATTERNS.filter((p) => p.test(text)).length >= 2 && !hasOverrideBlocker(text);
}

function isLikelyDeliveryNotification(text: string): boolean {
  // Needs at least 2 delivery signals (e.g. "delivered" + brand name,
  // or "out for delivery" + order number) and nothing asking the user to act.
  return DELIVERY_NOTIFICATION_PATTERNS.filter((p) => p.test(text)).length >= 2 && !hasOverrideBlocker(text);
}

function toSafe(result: ScanResult, confidence: number, explanation: string): ScanResult {
  return { ...result, classification: "SAFE", confidence, redFlags: [], suggestedActions: [], explanation };
}

export function applyClassificationGuardrails(text: string, result: ScanResult): ScanResult {
  const normalized = normalizeMessageText(text);
  const cleaned = stripSafetyWarnings(normalized);
  const threats = countGenuineThreats(cleaned);
  const flagged = result.classification === "SCAM" || result.classification === "PHISHING";

  // 1. Short casual messages with no threats are always safe
  if (isLikelyCasualSafeMessage(normalized) && threats === 0 && result.classification !== "SAFE") {
    return toSafe(result, Math.max(75, result.confidence), "Looks like a normal chat.");
  }

  // 2. Bank/UPI transaction alerts and OTPs the model over-flagged
  if (flagged && isLikelyTransactionalAlert(cleaned)) {
    return toSafe(result, Math.max(80, result.confidence), "Looks like a normal bank or payment alert.");
  }

  // 2b. Delivery and shipment updates the model over-flagged
  if (flagged && isLikelyDeliveryNotification(cleaned)) {
    return toSafe(result, Math.max(80, result.confidence), "Looks like a normal delivery update.");
  }

  // 3. No threat signals at all: only trust a confident SCAM/PHISHING verdict
  if (flagged && threats === 0 && result.confidence < UNBACKED_VERDICT_MIN_CONFIDENCE) {
    return toSafe(result, 60, "Nothing suspicious found.");
  }

  // 4. SAFE and PROMO results should never carry red flags or actions
  if (result.classification === "SAFE" || result.classification === "PROMO") {
    return { ...result, redFlags: [], suggestedActions: [] };
  }

  return result;
}
