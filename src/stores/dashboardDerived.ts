import type { ScanResult } from "../types";
import {
  calculateSafetyScore,
  getScoreColor,
  type ScannedMessage,
} from "../utils/scoreCalculator";

export type SuggestionSource = "scan" | "breach";

export interface TrackedSuggestion {
  id: string;
  text: string;
  acted: boolean;
  isFallback: boolean;
  source: SuggestionSource;
  sourceId: string;
}

export interface DashboardStateSlice {
  activeBreachesCount: number;
  protectedImagesCount: number;
  scannedMessages: ScannedMessage[];
  suggestions: TrackedSuggestion[];
}

export function normalizeSuggestionText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

// Stable across restarts, so a ticked action saved under this id is found again.
export function suggestionId(source: SuggestionSource, sourceId: string, index: number): string {
  return `${source}-${sourceId}-${index}`;
}

// Normalised, non-empty and de-duplicated (ignoring case), in their original order.
export function uniqueSuggestionTexts(texts: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const text of texts.map(normalizeSuggestionText)) {
    const key = text.toLowerCase();
    if (text.length > 0 && !seen.has(key)) {
      seen.add(key);
      unique.push(text);
    }
  }
  return unique;
}

// A scam or phishing result always has something to act on, so its score
// penalty can be cleared even when the model suggested nothing.
export const DEFAULT_THREAT_ACTIONS = ["Block the sender", "Delete the message"];

export function effectiveSuggestedActions(result: Pick<ScanResult, "classification" | "suggestedActions">): string[] {
  const actions = uniqueSuggestionTexts(result.suggestedActions);
  if (actions.length === 0 && (result.classification === "SCAM" || result.classification === "PHISHING")) {
    return DEFAULT_THREAT_ACTIONS;
  }
  return actions;
}

export function getScannedMessagesFromSuggestions(
  state: Pick<DashboardStateSlice, "scannedMessages" | "suggestions">
): ScannedMessage[] {
  const groupedSuggestions = new Map<
    string,
    { totalSuggestions: number; actedSuggestions: number }
  >();

  for (const suggestion of state.suggestions) {
    if (suggestion.source !== "scan") {
      continue;
    }

    const current = groupedSuggestions.get(suggestion.sourceId) ?? {
      totalSuggestions: 0,
      actedSuggestions: 0,
    };

    current.totalSuggestions += 1;
    if (suggestion.acted) {
      current.actedSuggestions += 1;
    }
    groupedSuggestions.set(suggestion.sourceId, current);
  }

  return state.scannedMessages.map((message) => {
    const current = groupedSuggestions.get(message.id);
    if (!current) {
      return message;
    }

    return {
      ...message,
      totalSuggestions: current.totalSuggestions,
      actedSuggestions: current.actedSuggestions,
    };
  });
}

export function getBreachActionProgressFromSuggestions(
  suggestions: TrackedSuggestion[]
): {
  totalSuggestions: number;
  actedSuggestions: number;
  resolvedBreachEquivalent: number;
  pendingBreachCount: number;
} {
  const actionableSuggestions = suggestions.filter(
    (suggestion) => suggestion.source === "breach" && !suggestion.isFallback
  );

  const perBreachTotals = new Map<string, { total: number; acted: number }>();
  for (const suggestion of actionableSuggestions) {
    const current = perBreachTotals.get(suggestion.sourceId) ?? { total: 0, acted: 0 };
    current.total += 1;
    if (suggestion.acted) {
      current.acted += 1;
    }
    perBreachTotals.set(suggestion.sourceId, current);
  }

  let resolvedBreachEquivalent = 0;
  let pendingBreachCount = 0;
  for (const progress of perBreachTotals.values()) {
    if (progress.total <= 0) {
      continue;
    }
    resolvedBreachEquivalent += progress.acted / progress.total;
    if (progress.acted < progress.total) {
      pendingBreachCount += 1;
    }
  }

  return {
    totalSuggestions: actionableSuggestions.length,
    actedSuggestions: actionableSuggestions.filter((suggestion) => suggestion.acted).length,
    resolvedBreachEquivalent,
    pendingBreachCount,
  };
}

export function calculateDashboardScore(
  state: DashboardStateSlice
): { SafetyScore: number; ScoreColor: string } {
  const hasPendingActions = state.suggestions.some(
    (suggestion) => !suggestion.isFallback && !suggestion.acted
  );
  const score = calculateSafetyScore({
    activeBreachesCount: state.activeBreachesCount,
    protectedImagesCount: state.protectedImagesCount,
    scannedMessages: state.scannedMessages,
    breachActionProgress: getBreachActionProgressFromSuggestions(state.suggestions),
    hasPendingActions,
  });

  return {
    SafetyScore: score,
    ScoreColor: getScoreColor(score),
  };
}

export function buildScanDashboardState(scanResults: ScanResult[]): {
  scannedMessages: ScannedMessage[];
  suggestions: TrackedSuggestion[];
} {
  const scannedMessages = scanResults
    .filter((result) => result.classification !== "UNAVAILABLE")
    .map((result) => ({
      id: result.id,
      riskType: result.classification,
      totalSuggestions: effectiveSuggestedActions(result).length,
      actedSuggestions: 0,
    })) as ScannedMessage[];

  const suggestions = scanResults.flatMap((result) =>
    effectiveSuggestedActions(result)
      .map((text, index) => ({
        id: suggestionId("scan", result.id, index),
        text,
        acted: false,
        isFallback: result.classification === "UNAVAILABLE",
        source: "scan" as const,
        sourceId: result.id,
      }))
  );

  return { scannedMessages, suggestions };
}
