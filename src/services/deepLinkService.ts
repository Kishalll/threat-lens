export type ThreatLensNotificationData = Record<string, unknown> | undefined;

export type ThreatLensRoute =
  | { type: "scan-result"; encodedResult: string; source: "notification" }
  | { type: "breach-detail"; breachId: string }
  | { type: "breach-list" }
  | { type: "scanner-prefill"; prefill: string }
  | { type: "shared-text"; text: string }
  | { type: "unknown" };

export function buildNotificationDeepLink(data?: ThreatLensNotificationData): string {
  if (typeof data?.encodedResult === "string" && data.encodedResult) {
    return `threatlens://scan/result?data=${encodeURIComponent(data.encodedResult)}`;
  }

  if (data?.type === "BREACH_ALERT") {
    const ids = Array.isArray(data.breachIds) ? data.breachIds : [];
    return ids.length === 1
      ? `threatlens://breach/${String(ids[0])}`
      : "threatlens://breach";
  }

  if (data?.type === "PASTE_FULL_NOTIFICATION_PROMPT") {
    const capturedText = typeof data.capturedText === "string" ? data.capturedText : "";
    return `threatlens://scanner?prefill=${encodeURIComponent(capturedText)}`;
  }

  return "";
}

export function parseThreatLensUrl(url: string | null): ThreatLensRoute | null {
  if (!url) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname;
  const path = parsedUrl.pathname.replace(/^\/+/, "");
  const fullPath = [host, path].filter(Boolean).join("/");

  if (fullPath === "scan/result") {
    const encodedResult = parsedUrl.searchParams.get("data");
    if (!encodedResult) {
      return { type: "unknown" };
    }
    return { type: "scan-result", encodedResult, source: "notification" };
  }

  if (host === "scanner") {
    const prefill = parsedUrl.searchParams.get("prefill");
    if (prefill && prefill.trim().length > 0) {
      return { type: "scanner-prefill", prefill };
    }
  }

  if (host === "breach") {
    return path
      ? { type: "breach-detail", breachId: path }
      : { type: "breach-list" };
  }

  const sharedText =
    parsedUrl.searchParams.get("text") ??
    parsedUrl.searchParams.get("android.intent.extra.TEXT");
  if (sharedText && sharedText.trim().length > 0) {
    return { type: "shared-text", text: sharedText };
  }

  return { type: "unknown" };
}
