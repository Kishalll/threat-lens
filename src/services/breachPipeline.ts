import type { BreachApiItem } from "./breachApiService";

export interface BreachScanOutcome {
  breaches: BreachApiItem[];
  newBreaches: BreachApiItem[];
}

export function sortBreachesNewestFirst(breaches: BreachApiItem[]): BreachApiItem[] {
  return [...breaches].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return bTime - aTime;
  });
}

export function formatCredentialSummary(breaches: BreachApiItem[]): string {
  const values = Array.from(
    new Set(
      breaches
        .map((breach) => breach.matchedCredential)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  );

  if (values.length === 0) {
    return "your monitored accounts";
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values[0]}, ${values[1]}, and ${values.length - 2} more`;
}

export function countActiveBreaches(breaches: BreachApiItem[]): number {
  return breaches.filter((breach) => !breach.resolved).length;
}

export function mergeBreachScanResults(
  previousBreaches: BreachApiItem[],
  fetchedBreaches: BreachApiItem[],
  activeCredentialValues: string[]
): BreachScanOutcome {
  const previousIds = new Set(previousBreaches.map((breach) => breach.id));
  const previousById = new Map(previousBreaches.map((breach) => [breach.id, breach]));
  const resolvedById = new Map(
    previousBreaches.map((breach) => [breach.id, Boolean(breach.resolved)])
  );
  const activeValues = new Set(activeCredentialValues);

  const activeResults = fetchedBreaches.filter(
    (breach) => !breach.matchedCredential || activeValues.has(breach.matchedCredential)
  );

  const merged = sortBreachesNewestFirst(activeResults).map((breach) => {
    const previous = previousById.get(breach.id);
    return {
      ...breach,
      resolved: resolvedById.get(breach.id) ?? Boolean(previous?.resolved ?? breach.resolved),
      aiGuidance:
        typeof previous?.aiGuidance === "string" && previous.aiGuidance.trim().length > 0
          ? previous.aiGuidance
          : breach.aiGuidance,
    };
  });

  return {
    breaches: merged,
    newBreaches: merged.filter((breach) => !previousIds.has(breach.id)),
  };
}
