import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { getActiveNimKey } from "./secureKeyService";
import { applyClassificationGuardrails } from "./classificationGuardrails";
import type { BreachGuidance, ScanResult } from "../types";

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------

// Both are reasoning models; requests turn thinking off or the token budget
// goes to reasoning and content comes back empty.
// Scanner: needs strong multilingual + Indian-context classification accuracy
const SCANNER_MODELS = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",  // primary: ~1.3s per scan
  "nvidia/nemotron-3.5-super-vl-120b-a12b", // fallback
];

// Breach guidance: longer-form generation, lower latency preferable
const BREACH_MODELS = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",  // primary
  "nvidia/nemotron-3.5-super-vl-120b-a12b", // fallback
];

const MODEL_BACKOFF_DEFAULT_MS = 60_000;
const MODEL_BACKOFF_DAILY_QUOTA_MS = 6 * 60 * 60 * 1000;
const MODEL_UNAVAILABLE_BACKOFF_MS = 24 * 60 * 60 * 1000;
const modelCooldownUntil = new Map<string, number>();

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const SCANNER_SYSTEM_PROMPT = `You are a cybersecurity expert for the Indian market. Classify messages as exactly one of SAFE, PROMO, SCAM, or PHISHING.
You understand all Indian languages and code-mixed variants (Hinglish, Tanglish, etc.).
Most messages people receive are harmless. Only flag a threat when the message itself shows one.

CATEGORIES (check top-to-bottom, first match wins):

1. PHISHING
   Tries to get credentials or account access: asks the user to share, enter or reply with an OTP, PIN, CVV, password, card or bank details. Links to "verify", "reactivate", "update KYC/PAN". Fake account urgency (suspended, blocked, expiring) pushing the user to a link. PHISHING tries to make you GIVE something.

2. SCAM
   Deception for money or action: impersonating police, CBI, customs, courier, electricity or telecom with threats ("digital arrest", disconnection tonight). Asks to call or WhatsApp a personal mobile number (not a helpline). Fake prizes, lottery, KBC, part-time jobs, investment or crypto returns, "sent money by mistake, please refund". SCAM tries to make you DO something (call, pay, transfer, install).

3. PROMO
   Marketing or offers: sales, discounts, recharge plans, cashback, new launches, app or service promotions. This includes bulk ads from unknown senders, as long as nothing deceptive is asked.

4. SAFE
   Everything else, including:
   - Bank, UPI and card alerts about a completed transaction (debited, credited, paid, received), even with footers or helpline numbers.
   - OTPs sent TO the user, especially ones that warn "do not share". The warning is a sign the message is genuine.
   - Delivery and order updates, delivery OTPs, bills, due date and renewal reminders from known services.
   - Government or institution notices with no credential or payment request.
   - Personal conversation, greetings, casual chat.

RULES:
- An unknown, short-code or business sender is NOT a threat by itself.
- Financial keywords alone (OTP, debit, account, KYC mentioned in a warning) do NOT make a message suspicious.
- SCAM/PHISHING need a concrete indicator: credential request, impersonation with urgency, a link with a verification demand, or payment pressure to a personal number.
- If you are unsure between SAFE and PROMO, pick PROMO only if it is selling something.
- For SAFE/PROMO: red_flags and suggested_actions MUST be empty arrays [].
- For SCAM/PHISHING: suggested_actions must be specific and actionable (e.g. "Block this number", "Report to your bank", "Do not click the link", "File complaint at cybercrime.gov.in"). Avoid generic advice.
- confidence should reflect how certain you are (0-100). Use 80+ for clear-cut cases, 50-79 for ambiguous ones.

WRITING STYLE (explanation, red_flags, suggested_actions):
- Write for someone who isn't technical. Short sentences, everyday words.
- explanation: 1-2 short sentences. Say what the message wants from the user and why that is a problem.
- red_flags: a few words each, e.g. "Asks for your OTP", "Link is not the bank's website".
- suggested_actions: short commands, e.g. "Block this number", "Don't click the link".
- No jargon ("malicious", "indicators", "threat actor", "social engineering"), no dashes, no exclamation marks.

EXAMPLES:
- "482913 is your OTP for Rs 2,499 at Amazon on HDFC Bank card XX1234. Never share your OTP with anyone." -> SAFE
- "Rs 500.00 debited from A/c XX4521 to VPA abc@okicici. UPI Ref 61234. Not you? Call 18001234567" -> SAFE
- "Flat 60% off on sneakers this weekend only! Shop now at myntra.com. T&C apply" -> PROMO
- "Your SBI account will be blocked today. Update your PAN here: bit.ly/sbi-kyc-upd" -> PHISHING
- "Dear consumer, your electricity will be disconnected tonight. Call officer 9876543210 immediately" -> SCAM
- "Part time job! Earn Rs 5000 daily from home. WhatsApp 8123456789 now" -> SCAM

Respond ONLY with valid JSON. Schema:
{
  "classification": "SAFE|PROMO|SCAM|PHISHING",
  "confidence": 0-100,
  "explanation": "1-2 short sentences in plain words",
  "red_flags": ["specific suspicious element"],
  "suggested_actions": ["specific actionable step"]
}`;

// JSON schema sent as response_format (grammar-constrained output)
const SCANNER_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    classification: {
      type: "string" as const,
      enum: ["SAFE", "PROMO", "SCAM", "PHISHING"],
    },
    confidence: { type: "number" as const },
    explanation: { type: "string" as const },
    red_flags: { type: "array" as const, items: { type: "string" as const } },
    suggested_actions: { type: "array" as const, items: { type: "string" as const } },
  },
  required: ["classification", "confidence", "explanation", "red_flags", "suggested_actions"],
};

const BREACH_SYSTEM_PROMPT = `You are a cybersecurity assistant helping users recover from data breaches.
Respond ONLY with valid JSON, no markdown and no text outside the JSON object.

Schema:
{
  "summary": "1-2 short sentences on what leaked and what it means for the user",
  "action_items": ["short step", "short step", "short step"]
}

Rules: keep the summary separate from the action items. Write for someone who isn't technical: short sentences, everyday words, no jargon, no dashes. Action items are short commands the user can do right now, e.g. "Change your Canva password".`;

// ---------------------------------------------------------------------------
// NIM client
// ---------------------------------------------------------------------------

async function getNIMClient(overrideKey?: string): Promise<OpenAI> {
  const apiKey = overrideKey ?? (await getActiveNimKey()).key;
  if (!apiKey) {
    throw new Error("No NVIDIA key set. Add one in Settings on the Home tab.");
  }
  return new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
    dangerouslyAllowBrowser: true,
    timeout: 15000, 
    maxRetries: 0,
  });
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function isModelUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message.toLowerCase();
  return (
    m.includes("404") ||
    m.includes("410") ||
    m.includes("gone") ||
    m.includes("is not found") ||
    m.includes("not supported") ||
    m.includes("unsupported parameter") ||
    m.includes("400 validation")
  );
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

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  return (
    message.includes("timeout") ||
    message.includes("timed out")
  );
}

function canTryNextModel(error: unknown): boolean {
  return (
    isModelUnavailableError(error) ||
    isQuotaOrRateLimitError(error) ||
    isTimeoutError(error)
  );
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
  jsonSchema?: Record<string, unknown>,
): Promise<string> {
  const client = await getNIMClient();
  let lastError: unknown = null;
  let skipped = 0;
  const now = Date.now();

  for (const model of getAvailableModels(candidates)) {
    if ((modelCooldownUntil.get(model) ?? 0) > now) { skipped++; continue; }
    try {
      // chat_template_kwargs isn't in the SDK types; the SDK sends it through as-is.
      const baseBody: ChatCompletionCreateParamsNonStreaming & {
        chat_template_kwargs: { enable_thinking: boolean };
      } = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
        top_p: 0.7,
        max_tokens: maxTokens,
        chat_template_kwargs: { enable_thinking: false },
      };

      // Try with a JSON schema first for grammar-constrained output.
      // If the model doesn't support it, fall back to prompt-only JSON.
      if (jsonSchema) {
        try {
          const resp = await client.chat.completions.create({
            ...baseBody,
            response_format: { type: "json_schema", json_schema: { name: "result", schema: jsonSchema } },
          });
          return resp.choices[0]?.message?.content ?? "";
        } catch (schemaError) {
          // If the model rejects the schema (400/unsupported), retry without it
          const isUnsupported = schemaError instanceof Error &&
            (schemaError.message.includes("400") || schemaError.message.toLowerCase().includes("unsupported"));
          if (!isUnsupported) throw schemaError;
          console.warn(`[NIM] json_schema not supported by ${model}, retrying without it`);
        }
      }

      const resp = await client.chat.completions.create(baseBody);
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
    value === "SAFE" || value === "PROMO" ||
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
    suggestedActions: ["Try again in a few minutes."],
    explanation,
  };
}

function getClassifyFallbackExplanation(error: unknown): string {
  if (isCompromisedOrInvalidKeyError(error)) {
    return "NVIDIA rejected your key. Check it in Settings on the Home tab.";
  }
  if (isQuotaOrRateLimitError(error)) {
    return "The AI is busy right now. Try again in a minute.";
  }
  return "Couldn't check this message right now.";
}

function getBreachFallbackGuidance(error: unknown): BreachGuidance {
  if (isCompromisedOrInvalidKeyError(error)) {
    return {
      summary: "Couldn't make a plan. NVIDIA rejected your key.",
      actionItems: ["Check your NVIDIA key in Settings", "Change the password for this account", "Turn on two-step login"],
      isFallback: true,
    };
  }
  return {
    summary: "Change the password for this account and watch for anything odd.",
    actionItems: ["Change the password for this account", "Turn on two-step login", "Watch for fake emails and messages"],
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
    summary: summaryLine ?? "Change the password for this account and watch for anything odd.",
    actionItems: actionLines.length > 0 ? actionLines : ["Change the password for this account", "Turn on two-step login", "Watch for fake emails and messages"],
    isFallback,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type NimKeyTestResult = "works" | "rejected" | "unreachable";

// One tiny request to check a key before it is saved.
export async function testNimKey(apiKey: string): Promise<NimKeyTestResult> {
  try {
    const client = await getNIMClient(apiKey.trim());
    const body: ChatCompletionCreateParamsNonStreaming & { chat_template_kwargs: { enable_thinking: boolean } } = {
      model: SCANNER_MODELS[0],
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
      chat_template_kwargs: { enable_thinking: false },
    };
    await client.chat.completions.create(body);
    return "works";
  } catch (error) {
    if (isCompromisedOrInvalidKeyError(error)) return "rejected";
    // Rate limited means NVIDIA accepted the key; it is just busy.
    if (error instanceof Error && error.message.includes("429")) return "works";
    return "unreachable";
  }
}

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
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "No reason given.",
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
