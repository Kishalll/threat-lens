import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
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

const SCANNER_SYSTEM_PROMPT = `You are a cybersecurity expert specialising in consumer fraud detection for the Indian market.

You understand scam and phishing patterns common in India including:
- UPI payment scams (fake UPI IDs, payment pending tricks, refund frauds)
- OTP theft (impersonating banks, telecom operators, TRAI, NPCI, government portals)
- KYC phishing (fake bank/wallet/Jio/Airtel KYC expiry messages)
- Fake prize, lottery, or cashback offers
- Job offer scams and part-time work-from-home fraud
- Loan app harassment and fake loan approval scams
- Impersonation of government agencies (UIDAI, Income Tax, EPFO, police)
- WhatsApp-based investment fraud and "doubling money" scams
- Parcel/customs scam calls and smishing

You can read and understand all major Indian languages: Hindi, Bengali, Tamil, Telugu, Marathi, Kannada, Gujarati, Malayalam, Punjabi, Odia, and Hinglish (mixed Hindi-English). Classify the message regardless of which language it is in.

Classification policy:
- SAFE for normal personal conversation (greetings, friendly invitations, casual chat) with no threat indicators.
- SAFE for standard bank/card transaction alerts: messages that notify of a debit or credit with a specific amount, masked card or account number, merchant name, and a timestamp — and do NOT ask for OTP, PIN, CVV, password, KYC verification, or account reactivation. Generic informational footers such as "click here for service charges and fees" or "for more details visit our website" do not make a transaction alert unsafe.
- PHISHING if a message uses transaction alert formatting (amount, card number, bank name) but also requests credentials, OTP, KYC, or creates urgency to click a link to "verify", "reactivate", or "confirm" the transaction.
- Do not label a message SCAM or PHISHING without concrete indicators: credential theft attempt, OTP request, account verification pressure, suspicious links with urgency, payment demand, or impersonation urgency.
- SPAM for unsolicited promotional content with no active threat.

Respond ONLY with valid JSON — no markdown, no text outside the JSON object.

Schema:
{
  "classification": "SAFE|SPAM|SCAM|PHISHING",
  "confidence": 0-100,
  "explanation": "max 3 sentences plain English",
  "red_flags": ["specific suspicious elements"],
  "suggested_actions": ["actionable steps"]
}`;

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

const SUSPICIOUS_SIGNAL_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /bit\.ly|tinyurl|t\.co|shorturl/i,
  /otp|one[-\s]?time\s?password/i,
  /kyc|verify\s+account|account\s+suspended|reactivate/i,
  /bank|upi|card|cvv|pin|password/i,
  /click\s+here|urgent|immediately|act\s+now/i,
  /pay|payment|transfer|send\s+money|refund/i,
  /lottery|prize|winner|gift\s?card/i,
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
): Promise<string> {
  const client = await getNIMClient();
  let lastError: unknown = null;
  let skipped = 0;
  const now = Date.now();

  for (const model of getAvailableModels(candidates)) {
    if ((modelCooldownUntil.get(model) ?? 0) > now) { skipped++; continue; }
    try {
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
        top_p: 0.7,
        max_tokens: maxTokens,
      });
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
  if (value === "SAFE" || value === "SPAM" || value === "SCAM" || value === "PHISHING") return value;
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

function countSuspiciousSignals(text: string): number {
  return SUSPICIOUS_SIGNAL_PATTERNS.filter((p) => p.test(text)).length;
}

function isLikelyCasualSafeMessage(text: string): boolean {
  const normalized = normalizeMessageText(text);
  if (!normalized || normalized.split(" ").filter(Boolean).length > 7) return false;
  return CASUAL_SAFE_PATTERNS.some((p) => p.test(normalized));
}

function applyClassificationGuardrails(text: string, result: ScanResult): ScanResult {
  const normalized = normalizeMessageText(text);
  const signals = countSuspiciousSignals(normalized);
  const casual = isLikelyCasualSafeMessage(normalized);

  if (casual && signals === 0 && result.classification !== "SAFE") {
    return {
      ...result,
      classification: "SAFE",
      confidence: Math.max(75, result.confidence),
      redFlags: [],
      suggestedActions: [],
      explanation: "Likely normal conversation with no clear scam indicators.",
    };
  }

  if (signals === 0 && (result.classification === "SCAM" || result.classification === "PHISHING")) {
    return {
      ...result,
      classification: "SPAM",
      confidence: Math.min(result.confidence, 55),
      redFlags: [],
      explanation: "No strong phishing or scam signals detected.",
      suggestedActions: ["Treat with caution only if sender is unknown."],
    };
  }

  if (result.classification === "SAFE") {
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
