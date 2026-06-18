import axios, { AxiosError } from "axios";

const XPOSED_DEFAULT_COOLDOWN_MS = 5_000;
const LEAKCHECK_DEFAULT_COOLDOWN_MS = 15_000;
const XPOSED_API_BASE_URL = "https://api.xposedornot.com";
const LEAKCHECK_API_BASE_URL = "https://leakcheck.io/api/public";
let xposedRateLimitedUntil = 0;
let leakCheckRateLimitedUntil = 0;

export type BreachApiItem = {
  id: string;
  canonicalId?: string;
  name: string;
  domain: string;
  date: string;
  description: string;
  dataClasses: string[];
  matchedCredential?: string;
  matchedCredentialType?: "email" | "username";
  source: "XposedOrNot" | "LeakCheck";
  resolved?: boolean;
  aiGuidance?: string;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function isRateLimitError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error) && error.response?.status === 429;
}

function isNotFoundError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function getRetryAfterMs(error: AxiosError, defaultCooldownMs: number): number {
  const retryHeader = error.response?.headers?.["retry-after"];
  if (typeof retryHeader === "string") {
    const retrySeconds = Number(retryHeader);
    if (!Number.isNaN(retrySeconds) && retrySeconds > 0) {
      return Math.max(Math.ceil(retrySeconds * 1000), 1_000);
    }
  }

  const retryMatch = error.message.match(/retry in\s+([\d.]+)s/i);
  if (retryMatch?.[1]) {
    const retrySeconds = Number(retryMatch[1]);
    if (!Number.isNaN(retrySeconds) && retrySeconds > 0) {
      return Math.max(Math.ceil(retrySeconds * 1000), 1_000);
    }
  }

  return defaultCooldownMs;
}

function normalizeDate(value: unknown): string {
  if (typeof value !== "string") {
    return new Date().toISOString();
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return new Date().toISOString();
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01T00:00:00.000Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function mapXposedBreachDetails(details: any[]): BreachApiItem[] {
  return details.map((detail) => ({
    id: detail?.breach || detail?.domain || Math.random().toString(),
    name: detail?.breach || "Unknown Breach",
    domain: detail?.domain || "Unknown Domain",
    date: normalizeDate(detail?.xposed_date),
    description:
      detail?.details || "Your email was found in a data breach.",
    dataClasses:
      typeof detail?.xposed_data === "string"
        ? detail.xposed_data.split(";").filter((v: string) => v.trim().length > 0)
        : ["Email"],
    source: "XposedOrNot",
  }));
}

function mapXposedAnalyticsResponse(data: any): BreachApiItem[] {
  const exposedBreaches = data?.ExposedBreaches;

  if (Array.isArray(exposedBreaches)) {
    const details = exposedBreaches.flatMap((item) => {
      if (Array.isArray(item?.breaches_details)) {
        return item.breaches_details;
      }
      return item ? [item] : [];
    });
    return mapXposedBreachDetails(details);
  }

  if (Array.isArray(exposedBreaches?.breaches_details)) {
    return mapXposedBreachDetails(exposedBreaches.breaches_details);
  }

  return [];
}

function mapXposedCheckEmailResponse(data: any): BreachApiItem[] {
  const breachNamesRaw = Array.isArray(data?.breaches) ? data.breaches : [];
  const flatBreachNames = breachNamesRaw.flatMap((item: unknown) =>
    Array.isArray(item) ? item : [item]
  );
  const breachNames = flatBreachNames
    .filter((name: unknown): name is string => typeof name === "string")
    .map((name: string) => name.trim())
    .filter((name: string) => name.length > 0);

  return breachNames.map((name: string) => ({
    id: name,
    name,
    domain: "Unknown Domain",
    date: normalizeDate(undefined),
    description: "This email appears in XposedOrNot breach records.",
    dataClasses: ["Email"],
    source: "XposedOrNot",
  }));
}

function mapLeakCheckResponse(data: any, inputType: "email" | "username"): BreachApiItem[] {
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const fields = toStringArray(data?.fields);

  return sources.map((source: any, index: number) => {
    const sourceName = typeof source?.name === "string" && source.name.trim().length > 0
      ? source.name.trim()
      : "Unknown Leak Source";

    return {
      id: `${sourceName}:${source?.date ?? index}`,
      name: sourceName,
      domain: sourceName,
      date: normalizeDate(source?.date),
      description: `This ${inputType} was found in LeakCheck source ${sourceName}.`,
      dataClasses: fields.length > 0 ? fields : ["Unknown"],
      source: "LeakCheck",
    };
  });
}

export async function checkEmailWithXposedOrNot(email: string): Promise<BreachApiItem[]> {
  try {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return [];

    if (Date.now() < xposedRateLimitedUntil) {
      return [];
    }

    // Primary: breach analytics endpoint with email query param on api.xposedornot.com
    const analyticsResponse = await axios.get(`${XPOSED_API_BASE_URL}/v1/breach-analytics`, {
      params: { email: trimmedEmail },
      timeout: 10000,
    });

    if (analyticsResponse.status !== 200 || !analyticsResponse.data) {
      return [];
    }

    // Explicit not-found payload from API
    if (analyticsResponse.data?.Error === "Not found") {
      return [];
    }

    const analyticsItems = mapXposedAnalyticsResponse(analyticsResponse.data);
    if (analyticsItems.length > 0) {
      return analyticsItems;
    }

    // Fallback: check-email endpoint can still return breach names when analytics lacks details.
    const checkEmailResponse = await axios.get(
      `${XPOSED_API_BASE_URL}/v1/check-email/${encodeURIComponent(trimmedEmail)}`,
      { timeout: 10000 }
    );

    if (checkEmailResponse.status !== 200 || !checkEmailResponse.data) {
      return [];
    }

    if (checkEmailResponse.data?.Error === "Not found") {
      return [];
    }

    return mapXposedCheckEmailResponse(checkEmailResponse.data);
  } catch (error) {
    if (isNotFoundError(error)) {
      // XposedOrNot returns 404 when no breach data is found for an email.
      return [];
    }

    if (isRateLimitError(error)) {
      const cooldownMs = getRetryAfterMs(error, XPOSED_DEFAULT_COOLDOWN_MS);
      xposedRateLimitedUntil = Date.now() + cooldownMs;
      throw new Error(
        `XposedOrNot is rate limited right now. Please retry in about ${Math.ceil(cooldownMs / 1000)}s.`
      );
    }

    console.error("XposedOrNot API Error", error);
    throw new Error("Unable to fetch breach data from XposedOrNot.");
  }
}

export async function checkWithLeakCheck(identifier: string, inputType: "email" | "username"): Promise<BreachApiItem[]> {
  try {
    const trimmed = identifier.trim();
    if (!trimmed) return [];

    if (inputType === "username" && trimmed.length < 3) {
      return [];
    }

    if (Date.now() < leakCheckRateLimitedUntil) {
      return [];
    }

    const response = await axios.get(LEAKCHECK_API_BASE_URL, {
      params: { check: trimmed },
      timeout: 10000,
    });

    if (response.status !== 200 || !response.data) {
      return [];
    }

    if (response.data?.success !== true) {
      return [];
    }

    return mapLeakCheckResponse(response.data, inputType);

  } catch (error) {
    if (isRateLimitError(error)) {
      const cooldownMs = getRetryAfterMs(error, LEAKCHECK_DEFAULT_COOLDOWN_MS);
      leakCheckRateLimitedUntil = Date.now() + cooldownMs;
      throw new Error(
        `LeakCheck is rate limited right now. Please retry in about ${Math.ceil(cooldownMs / 1000)}s.`
      );
    }

    if (isNotFoundError(error)) {
      return [];
    }

    console.error("LeakCheck API Error", error);
    throw new Error("Unable to fetch breach data from LeakCheck.");
  }
}

export async function checkAllCredentials(emailOrUsernames: string[]): Promise<BreachApiItem[]> {
  const allBreaches: BreachApiItem[] = [];
  const normalizedInputs = Array.from(
    new Set(emailOrUsernames.map((item) => item.trim()).filter((item) => item.length > 0))
  );
  
  for (const item of normalizedInputs) {
    const isEmail = item.includes("@");
    
    if (isEmail) {
      let xoResults: BreachApiItem[] = [];
      let xoError: Error | null = null;

      try {
        xoResults = await checkEmailWithXposedOrNot(item);
      } catch (error) {
        xoError = new Error(toErrorMessage(error, "XposedOrNot lookup failed."));
      }

      allBreaches.push(
        ...xoResults.map((breach) => ({
          ...breach,
          canonicalId: breach.id,
          id: `${breach.id}::${item.toLowerCase()}`,
          matchedCredential: item,
          matchedCredentialType: "email" as const,
        }))
      );

      if (xoResults.length === 0) {
        let leakResults: BreachApiItem[] = [];
        let leakError: Error | null = null;

        try {
          leakResults = await checkWithLeakCheck(item, "email");
        } catch (error) {
          leakError = new Error(toErrorMessage(error, "LeakCheck lookup failed."));
        }

        if (leakError && xoError) {
          throw new Error(`${xoError.message} ${leakError.message}`.trim());
        }

        if (leakError && !xoError) {
          throw leakError;
        }

        allBreaches.push(
          ...leakResults.map((breach) => ({
            ...breach,
            canonicalId: breach.id,
            id: `${breach.id}::${item.toLowerCase()}`,
            matchedCredential: item,
            matchedCredentialType: "email" as const,
          }))
        );
      }
    } else {
      // Username -> use LeakCheck
      const leakResults = await checkWithLeakCheck(item, "username");
      allBreaches.push(
        ...leakResults.map((breach) => ({
          ...breach,
          canonicalId: breach.id,
          id: `${breach.id}::${item.toLowerCase()}`,
          matchedCredential: item,
          matchedCredentialType: "username" as const,
        }))
      );
    }
  }

  // Deduplicate by ID
  const map = new Map<string, BreachApiItem>();
  for (const b of allBreaches) {
    if (!map.has(b.id)) map.set(b.id, b);
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return bTime - aTime;
  });
}