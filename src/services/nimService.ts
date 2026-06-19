import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { getKey } from "./secureKeyService";
import type { BreachGuidance, ScanResult } from "../types";

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------

// Scanner: needs strong multilingual + Indian-context classification accuracy
const SCANNER_MODELS = [
  "meta/llama-3.3-70b-instruct",            // primary — best multilingual instruction following
  "nv-mistralai/mistral-nemo-12b-instruct", // fallback
];

// Breach guidance: longer-form generation, lower latency preferable
const BREACH_MODELS = [
  "meta/llama-3.1-8b-instruct",             // primary — fast, sufficient for guidance text
  "nv-mistralai/mistral-nemo-12b-instruct", // fallback
];

const MODEL_BACKOFF_DEFAULT_MS = 60_000;
const MODEL_BACKOFF_DAILY_QUOTA_MS = 6 * 60 * 60 * 1000;
const MODEL_UNAVAILABLE_BACKOFF_MS = 24 * 60 * 60 * 1000;
const modelCooldownUntil = new Map<string, number>();

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const SCANNER_SYSTEM_PROMPT = `You are a cybersecurity expert for the Indian market. You classify messages as SAFE, PROMO, SPAM, SCAM, or PHISHING.

You understand Hindi, Tamil, Telugu, Bengali, Marathi, Kannada, Gujarati, Malayalam, Punjabi, Odia, and code-mixed variants (Hinglish, Tanglish, etc.). Apply the same classification logic regardless of language.

CLASSIFICATION DECISION TREE (follow in order, first match wins):

1. TRANSACTION ALERT -> SAFE
   A message that reports a completed, received, or scheduled financial transaction.
   Structural pattern:
   - Contains a specific monetary amount
   - Contains an account, card, or registration identifier (often partially masked)
   - Reports the transaction as done (debited, credited, received, transferred, paid, successful)
   - May include reference number, timestamp, merchant name, or institutional sender
   - Standard footers (service charges link, copyright notice, "visit website for details") are part of the alert and do NOT change the classification to SPAM or anything else
   - Key test: the message INFORMS about a completed event. It does NOT ask the user to take any authentication or verification action.

2. INSTITUTIONAL / GOVERNMENT COMMUNICATION -> SAFE
   A message from a government body, regulatory authority, educational institution, or public utility that provides information, policy updates, or public service announcements.
   - Official domains (.gov.in, .nic.in, .edu.in, .ac.in) or recognised regulatory bodies (TRAI, SEBI, RBI informational notices, UIDAI)
   - Informational or advisory in nature
   - No credential or payment request

3. CREDENTIAL HARVESTING -> PHISHING
   The message attempts to extract sensitive credentials or direct the user to provide them.
   - Requests OTP, PIN, CVV, password, or banking credentials
   - Links to "verify", "reactivate", "update KYC", "confirm identity"
   - Mimics bank or institution formatting but adds a credential request or verification link
   - Creates account-related urgency ("suspended", "blocked", "expiring", "will be deactivated")

4. SOCIAL ENGINEERING / IMPERSONATION -> SCAM
   The message uses deception to trick the user into an action that benefits the scammer.
   - Impersonation of utilities, government, police, or companies combined with urgency ("disconnected tonight", "arrested", "legal action")
   - Directing to personal mobile numbers instead of institutional helplines
   - Fake prizes, lottery wins, cashback, job offers, investment schemes
   - "Doubling money", work-from-home payment schemes
   - Pressure to call, pay, or transfer money immediately
   - Key difference from phishing: SCAM tries to make you DO something (call, pay, transfer). PHISHING tries to make you GIVE something (credentials, OTP).

5. PROMOTIONAL CONTENT FROM IDENTIFIABLE BUSINESS -> PROMO
   Commercial offers, deals, plans, or marketing from a recognisable company or brand.
   - Telecom offers, e-commerce deals, subscription upgrades, app promotions from known brands
   - Marketing language (offers, discounts, limited period)
   - No credential request, no impersonation, no deceptive urgency
   - Return empty arrays for red_flags and suggested_actions

6. UNSOLICITED / UNKNOWN SENDER CONTENT -> SPAM
   Messages from unidentifiable or suspicious senders that do not clearly come from a known business.
   - Bulk-messaging patterns from unknown sources
   - No identifiable legitimate sender
   - Irrelevant or low-quality content

7. NORMAL CONVERSATION -> SAFE
   Personal messages, greetings, casual chat, friendly invitations with no threat indicators.

RULES:
- Follow the decision tree top to bottom. The FIRST matching category wins.
- Never classify a transaction alert as SPAM or PHISHING just because it contains financial keywords or a standard footer link. Financial keywords are expected in transaction alerts.
- Never classify a message as SCAM or PHISHING without at least one concrete threat indicator: credential request, impersonation with urgency, suspicious link with verification demand, or payment pressure directed at a personal number.
- For PROMO and SAFE: return empty arrays for red_flags and suggested_actions.

Respond ONLY with valid JSON.

Schema:
{
  "classification": "SAFE|PROMO|SPAM|SCAM|PHISHING",
  "confidence": 0-100,
  "explanation": "max 3 sentences, plain English",
  "red_flags": ["specific suspicious elements found"],
  "suggested_actions": ["actionable steps for user"]
}`;

// JSON schema passed to NIM's guided_json for guaranteed valid output
const SCANNER_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    classification: {
      type: "string" as const,
      enum: ["SAFE", "PROMO", "SPAM", "SCAM", "PHISHING"],
    },
    confidence: { type: "integer" as const, minimum: 0, maximum: 100 },
    explanation: { type: "string" as const },
    red_flags: { type: "array" as const, items: { type: "string" as const } },
    suggested_actions: { type: "array" as const, items: { type: "string" as const } },
  },
  required: ["classification", "confidence", "explanation", "red_flags", "suggested_actions"],
};

const BREACH_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    summary: { type: "string" as const },
    action_items: { type: "array" as const, items: { type: "string" as const } },
  },
  required: ["summary", "action_items"],
};

const BREACH_SYSTEM_PROMPT = `You are a cybersecurity assistant helping users recover from data breaches.
Respond ONLY with valid JSON — no markdown, no text outside the JSON object.

Schema:
{
  "summary": "1-2 short plain English sentences about the breach impact",
  "action_items": ["short actionable step", "short actionable step", "short actionable step"]
}

Rules: keep summary separate from action items. Use plain English. Prefer concrete steps the user can do right now.`;

// ---------------------------------------------------------------------------
// Guardrail patterns
// ---------------------------------------------------------------------------

// Genuine threat indicators (always suspicious regardless of context)
const GENUINE_THREAT_PATTERNS: RegExp[] = [
  /bit\.ly|tinyurl|t\.co|shorturl|goo\.gl|is\.gd|cutt\.ly/i,
  /otp|one[-\s]?time\s?password/i,
  /kyc|verify\s+account|account\s+suspended|reactivate/i,
  /\bcvv\b|\bpin\b|\bpassword\b/i,
  /lottery|prize|winner|gift\s?card/i,
  /share\s+(your|ur)\s+(otp|pin|cvv|password)/i,
  /enter\s+(your|ur)\s+(otp|pin|cvv|password)/i,
];

// Patterns that identify a transactional alert (bank/UPI/institution payment notification)
const TRANSACTIONAL_ALERT_PATTERNS: RegExp[] = [
  /(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d{1,2})?/i,                       // monetary amount
  /(?:a\/c|account|card)\s*(?:no\.?\s*)?(?:ending|[xX*]+)\s*\d{3,}/i, // masked account/card
  /ending\s+\d{4}/i,                                                  // card ending XXXX
  /\b(?:debited|credited|received|transferred|paid|successful)\b/i,   // transaction verbs
  /\b(?:ref|reference|txn|neft|imps|rtgs|upi\s*ref)\b/i,              // reference patterns
];

// Patterns that indicate credential harvesting (true threat in financial context)
const CREDENTIAL_REQUEST_PATTERNS: RegExp[] = [
  /share\s+(your|ur)\b/i,
  /enter\s+(your|ur)\b/i,
  /\b(?:verify|update|confirm|reactivate)\s+(?:your|ur)?\s*(?:account|kyc|identity|details)\b/i,
  /\b(?:suspended|blocked|deactivated|frozen)\b.*\b(?:click|tap|call|contact|visit)\b/i,
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

// ---------------------------------------------------------------------------
// NIM client
// ---------------------------------------------------------------------------

async function getNIMClient(): Promise<OpenAI> {
  let apiKey = process.env.EXPO_PUBLIC_NIM_API_KEY;
  if (!apiKey) apiKey = (await getKey("NIM_API_KEY")) ?? undefined;
  if (!apiKey) {
    throw new Error("NIM_API_KEY not found. Please add EXPO_PUBLIC_NIM_API_KEY to your .env file.");
  }
  return new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function isModelUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message.toLowerCase();
  return m.includes("404") || m.includes("is not found") || m.includes("not supported");
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message.toLowerCase();
  return (
    m.includes("429") || m.includes("quota") || m.includes("rate limit") ||
    m.includes("rate-limit") || m.includes("overloaded") || m.includes("503") ||
    m.includes("service unavailable") || m.includes("unavailable")
  );
}

function isCompromisedOrInvalidKeyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message.toLowerCase();
  return m.includes("invalid api key") || m.includes("permission denied") ||
    m.includes("401") || m.includes("403");
}

function canTryNextModel(error: unknown): boolean {
  return isModelUnavailableError(error) || isQuotaOrRateLimitError(error);
}

function extractRetryAfterMs(message: string): number {
  const match = message.match(/retry in\s+([\d.]+)s/i) ??
                message.match(/retry[_\-\s]?after[:\s]+([\d.]+)/i);
  if (match?.[1]) {
    const seconds = Number(match[1]);
    if (!Number.isNaN(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
  }
  return 0;
}

function applyModelBackoff(modelName: string, error: unknown): void {
  if (!(error instanceof Error)) return;
  const retryAfterMs = extractRetryAfterMs(error.message);
  const isDailyQuota = /daily|per.?day/i.test(error.message);
  const backoffMs = isModelUnavailableError(error)
    ? MODEL_UNAVAILABLE_BACKOFF_MS
    : isDailyQuota
      ? Math.max(retryAfterMs, MODEL_BACKOFF_DAILY_QUOTA_MS)
      : Math.max(retryAfterMs, MODEL_BACKOFF_DEFAULT_MS);
  modelCooldownUntil.set(modelName, Date.now() + backoffMs);
}

function getAvailableModels(candidates: string[]): string[] {
  const now = Date.now();
  return [...candidates].sort((a, b) => {
    const aReady = (modelCooldownUntil.get(a) ?? 0) <= now ? 0 : 1;
    const bReady = (modelCooldownUntil.get(b) ?? 0) <= now ? 0 : 1;
    if (aReady !== bReady) return aReady - bReady;
    return (modelCooldownUntil.get(a) ?? 0) - (modelCooldownUntil.get(b) ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Core generation
// ---------------------------------------------------------------------------

async function generateWithNIM(
  systemPrompt: string,
  userContent: string,
  candidates: string[],
  maxTokens: number,
  guidedJsonSchema?: Record<string, unknown>,
): Promise<string> {
  const client = await getNIMClient();
  let lastError: unknown = null;
  let skipped = 0;
  const now = Date.now();

  for (const model of getAvailableModels(candidates)) {
    if ((modelCooldownUntil.get(model) ?? 0) > now) { skipped++; continue; }
    try {
      const requestBody: ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
        top_p: 0.7,
        max_tokens: maxTokens,
      };

      // Use NIM's guided_json for grammar-constrained JSON output when available.
      // The nvext field is a NIM-specific extension not in the OpenAI SDK types.
      if (guidedJsonSchema) {
        (requestBody as unknown as Record<string, unknown>).extra_body = {
          nvext: { guided_json: guidedJsonSchema },
        };
      }

      const resp = await client.chat.completions.create(requestBody);
      return resp.choices[0]?.message?.content ?? "";
    } catch (error) {
      lastError = error;
      applyModelBackoff(model, error);
      if (canTryNextModel(error)) continue;
      throw error;
    }
  }

  if (lastError == null && skipped > 0) {
    throw new Error("All NIM models are temporarily rate-limited. Please retry shortly.");
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("No NIM model available.");
}

// ---------------------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------------------

function extractJsonCandidate(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1).trim();
  return trimmed.replace(/^[`'"\uFEFF\s]+|[`'"\s]+$/g, "").trim();
}

function parseNIMJsonResponse(rawText: string): Record<string, unknown> {
  for (const candidate of [rawText.trim(), extractJsonCandidate(rawText)]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* try next */ }
  }
  throw new SyntaxError("Unable to parse valid JSON from NIM response");
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeClassification(value: unknown): ScanResult["classification"] {
  if (
    value === "SAFE" || value === "PROMO" || value === "SPAM" ||
    value === "SCAM" || value === "PHISHING"
  ) return value;
  return "SAFE";
}

function normalizeConfidence(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function normalizeGuidanceItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .filter((i): i is string => typeof i === "string")
    .map((i) => i.trim())
    .filter((i) => i.length > 0);
}

function normalizeMessageText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

function countGenuineThreats(text: string): number {
  return GENUINE_THREAT_PATTERNS.filter((p) => p.test(text)).length;
}

function countTransactionalSignals(text: string): number {
  return TRANSACTIONAL_ALERT_PATTERNS.filter((p) => p.test(text)).length;
}

function hasCredentialRequest(text: string): boolean {
  return CREDENTIAL_REQUEST_PATTERNS.some((p) => p.test(text));
}

function isLikelyCasualSafeMessage(text: string): boolean {
  const normalized = normalizeMessageText(text);
  if (!normalized || normalized.split(" ").filter(Boolean).length > 7) return false;
  return CASUAL_SAFE_PATTERNS.some((p) => p.test(normalized));
}

function isLikelyTransactionalAlert(text: string): boolean {
  // Needs at least 2 transactional signals (e.g. amount + masked account,
  // or amount + transaction verb) and no credential harvesting attempt.
  return countTransactionalSignals(text) >= 2 && !hasCredentialRequest(text);
}

function applyClassificationGuardrails(text: string, result: ScanResult): ScanResult {
  const normalized = normalizeMessageText(text);
  const threats = countGenuineThreats(normalized);
  const casual = isLikelyCasualSafeMessage(normalized);

  // 1. Short casual messages with no threats are always safe
  if (casual && threats === 0 && result.classification !== "SAFE") {
    return {
      ...result,
      classification: "SAFE",
      confidence: Math.max(75, result.confidence),
      redFlags: [],
      suggestedActions: [],
      explanation: "Likely normal conversation with no clear scam indicators.",
    };
  }

  // 2. Transaction alert protection: if the message structurally looks like
  //    a bank/UPI/institution payment notification and has no credential
  //    harvesting, override wrong classifications back to SAFE.
  if (
    isLikelyTransactionalAlert(normalized) &&
    (result.classification === "SPAM" || result.classification === "SCAM" || result.classification === "PHISHING")
  ) {
    return {
      ...result,
      classification: "SAFE",
      confidence: Math.max(80, result.confidence),
      redFlags: [],
      suggestedActions: [],
      explanation: "Transaction alert from a financial institution or service.",
    };
  }

  // 3. If no genuine threat patterns exist but LLM flagged SCAM/PHISHING,
  //    downgrade to SPAM (soft disagreement with the model).
  if (threats === 0 && (result.classification === "SCAM" || result.classification === "PHISHING")) {
    return {
      ...result,
      classification: "SPAM",
      confidence: Math.min(result.confidence, 55),
      redFlags: [],
      explanation: "No strong phishing or scam signals detected.",
      suggestedActions: ["Treat with caution only if sender is unknown."],
    };
  }

  // 4. SAFE and PROMO results should never carry red flags or actions
  if (result.classification === "SAFE" || result.classification === "PROMO") {
    return { ...result, redFlags: [], suggestedActions: [] };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------

function fallbackScanResult(text: string, explanation: string): ScanResult {
  return {
    id: uuidv4(),
    timestamp: Date.now(),
    classification: "UNAVAILABLE",
    confidence: 0,
    messagePreview: text.slice(0, 100),
    redFlags: [],
    suggestedActions: ["Retry in a few minutes once AI capacity is available."],
    explanation,
  };
}

function getClassifyFallbackExplanation(error: unknown): string {
  if (isCompromisedOrInvalidKeyError(error)) {
    return "NIM API key is invalid. Set a new EXPO_PUBLIC_NIM_API_KEY and restart the app.";
  }
  if (isQuotaOrRateLimitError(error)) {
    return "AI quota exceeded right now. Please retry shortly.";
  }
  return "Unable to analyse message at this time.";
}

function getBreachFallbackGuidance(error: unknown): BreachGuidance {
  if (isCompromisedOrInvalidKeyError(error)) {
    return {
      summary: "AI guidance unavailable — NIM API key is invalid.",
      actionItems: ["Add a valid API key and restart", "Change passwords for affected accounts", "Enable 2FA"],
      isFallback: true,
    };
  }
  return {
    summary: "Review the affected account, change credentials, and monitor for suspicious activity.",
    actionItems: ["Change passwords for affected accounts", "Enable 2FA", "Watch for phishing attempts"],
    isFallback: true,
  };
}

function fallbackGuidanceFromText(text: string, isFallback: boolean): BreachGuidance {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*]\s+/, ""))
    .filter((l) => l.length > 0);
  const [summaryLine, ...actionLines] = lines;
  return {
    summary: summaryLine ?? "Review the affected account, change credentials, and monitor for suspicious activity.",
    actionItems: actionLines.length > 0 ? actionLines : ["Change passwords", "Enable 2FA", "Watch for phishing"],
    isFallback,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function classifyMessage(text: string): Promise<ScanResult> {
  try {
    const responseText = await generateWithNIM(
      SCANNER_SYSTEM_PROMPT,
      `Message to classify:\n${text}`,
      SCANNER_MODELS,
      400, // JSON response is small; 400 tokens is well within free tier per-call budget
      SCANNER_JSON_SCHEMA,
    );

    const parsed = parseNIMJsonResponse(responseText);
    const redFlags = parsed.red_flags ?? parsed.redFlags;
    const suggestedActions = parsed.suggested_actions ?? parsed.suggestedActions;

    const aiResult: ScanResult = {
      id: uuidv4(),
      timestamp: Date.now(),
      classification: normalizeClassification(parsed.classification),
      confidence: normalizeConfidence(parsed.confidence),
      messagePreview: text.slice(0, 100),
      redFlags: Array.isArray(redFlags)
        ? (redFlags as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      suggestedActions: Array.isArray(suggestedActions)
        ? (suggestedActions as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "No explanation provided.",
    };

    return applyClassificationGuardrails(text, aiResult);
  } catch (error) {
    if (isCompromisedOrInvalidKeyError(error) || isQuotaOrRateLimitError(error) || isModelUnavailableError(error)) {
      console.warn("classifyMessage degraded", error);
      return fallbackScanResult(text, getClassifyFallbackExplanation(error));
    }
    console.error("classifyMessage failed", error);
    throw error;
  }
}

export async function generateBreachGuidance(breachMetadata: object): Promise<BreachGuidance> {
  try {
    const responseText = await generateWithNIM(
      BREACH_SYSTEM_PROMPT,
      `Breach details: ${JSON.stringify(breachMetadata)}`,
      BREACH_MODELS,
      300, // summary + 3 action items fits well within 300 tokens
      BREACH_JSON_SCHEMA,
    );

    const parsed = parseNIMJsonResponse(responseText) as {
      summary?: unknown;
      action_items?: unknown;
      actionItems?: unknown;
    };

    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const actionItems = normalizeGuidanceItems(parsed.action_items ?? parsed.actionItems);

    if (summary.length > 0 && actionItems.length > 0) {
      return { summary, actionItems, isFallback: false };
    }

    return fallbackGuidanceFromText(responseText, false);
  } catch (error) {
    if (isCompromisedOrInvalidKeyError(error) || isQuotaOrRateLimitError(error)) {
      console.warn("generateBreachGuidance degraded", error);
      return getBreachFallbackGuidance(error);
    }
    console.error("generateBreachGuidance failed", error);
    throw error;
  }
}
