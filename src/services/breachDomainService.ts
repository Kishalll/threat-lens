import { checkAllCredentials, type BreachApiItem } from "./breachApiService";
import {
  countActiveBreaches,
  formatCredentialSummary,
  mergeBreachScanResults,
} from "./breachPipeline";

export interface BreachCredentialInput {
  value: string;
}

export interface BreachAlertPayload {
  breachIds: string[];
  credentials: string[];
  credentialSummary: string;
  count: number;
}

export interface BreachScanExecutionResult {
  breaches: BreachApiItem[];
  newBreaches: BreachApiItem[];
  activeBreachesCount: number;
  scannedCredentialValues: string[];
  alertPayload: BreachAlertPayload | null;
}

export interface ExecuteBreachScanOptions {
  credentials: BreachCredentialInput[];
  previousBreaches: BreachApiItem[];
  fetchBreaches?: (credentialValues: string[]) => Promise<BreachApiItem[]>;
}

function normalizeCredentialValues(credentials: BreachCredentialInput[]): string[] {
  return Array.from(
    new Set(
      credentials
        .map((credential) => credential.value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

export function buildBreachAlertPayload(newBreaches: BreachApiItem[]): BreachAlertPayload | null {
  if (newBreaches.length === 0) {
    return null;
  }

  return {
    breachIds: newBreaches.map((breach) => breach.id),
    credentials: newBreaches
      .map((breach) => breach.matchedCredential)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    credentialSummary: formatCredentialSummary(newBreaches),
    count: newBreaches.length,
  };
}

export async function executeBreachScan(
  options: ExecuteBreachScanOptions
): Promise<BreachScanExecutionResult> {
  const scannedCredentialValues = normalizeCredentialValues(options.credentials);
  if (scannedCredentialValues.length === 0) {
    return {
      breaches: [],
      newBreaches: [],
      activeBreachesCount: 0,
      scannedCredentialValues,
      alertPayload: null,
    };
  }

  const fetchBreaches = options.fetchBreaches ?? checkAllCredentials;
  const fetchedBreaches = await fetchBreaches(scannedCredentialValues);
  const outcome = mergeBreachScanResults(
    options.previousBreaches,
    fetchedBreaches,
    scannedCredentialValues
  );

  return {
    breaches: outcome.breaches,
    newBreaches: outcome.newBreaches,
    activeBreachesCount: countActiveBreaches(outcome.breaches),
    scannedCredentialValues,
    alertPayload: buildBreachAlertPayload(outcome.newBreaches),
  };
}
