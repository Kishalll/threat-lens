import { create } from "zustand";
import { calculateSafetyScore, getScoreColor, type ScannedMessage } from "../utils/scoreCalculator";

export type SuggestionSource = "scan" | "breach";

export interface TrackedSuggestion {
  id: string;
  text: string;
  acted: boolean;
  isFallback: boolean;
  source: SuggestionSource;
  sourceId: string;
}

function normalizeSuggestionText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function getScannedMessagesFromState(state: DashboardState): ScannedMessage[] {
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

function getBreachActionProgressFromSuggestions(
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

function calculateScoreFromState(
  state: Pick<
    DashboardState,
    "activeBreachesCount" | "protectedImagesCount" | "scannedMessages" | "suggestions"
  >
): number {
  const hasPendingActions = state.suggestions.some(
    (s) => !s.isFallback && !s.acted
  );
  return calculateSafetyScore({
    activeBreachesCount: state.activeBreachesCount,
    protectedImagesCount: state.protectedImagesCount,
    scannedMessages: state.scannedMessages,
    breachActionProgress: getBreachActionProgressFromSuggestions(state.suggestions),
    hasPendingActions,
  });
}

export interface DashboardState {
  activeBreachesCount: number;
  protectedImagesCount: number;
  scannedMessages: ScannedMessage[];
  suggestions: TrackedSuggestion[];
  lastUpdateTimestamp: number;

  SafetyScore: number;
  ScoreColor: string;

  updateDashboardData: (
    data:
      | Partial<DashboardState>
      | ((state: DashboardState) => Partial<DashboardState>)
  ) => void;
  incrementProtectedImagesCount: () => void;
  registerSuggestions: (
    source: SuggestionSource,
    sourceId: string,
    suggestionTexts: string[],
    options?: { isFallback?: boolean; replaceExisting?: boolean }
  ) => void;
  recordScannedMessage: (message: ScannedMessage) => void;
  markSuggestionAsDone: (id: string) => void;
  getSuggestionsForSource: (
    source: SuggestionSource,
    sourceId: string
  ) => TrackedSuggestion[];
  pruneSuggestionsForSource: (
    source: SuggestionSource,
    allowedSourceIds: string[]
  ) => void;
  refreshScore: () => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  activeBreachesCount: 0,
  protectedImagesCount: 0,
  scannedMessages: [],
  suggestions: [],
  lastUpdateTimestamp: Date.now(),

  SafetyScore: 100,
  ScoreColor: "#4ADE80", // default safe

  updateDashboardData: (data) => {
    set((state) => {
      const patch = typeof data === "function" ? data(state) : data;
      const nextState = {
        ...state,
        ...patch,
        lastUpdateTimestamp: Date.now(),
      };
      const score = calculateScoreFromState(nextState);

      return {
        ...nextState,
        SafetyScore: score,
        ScoreColor: getScoreColor(score),
      };
    });
  },

  incrementProtectedImagesCount: () => {
    get().updateDashboardData((state) => ({
      protectedImagesCount: state.protectedImagesCount + 1,
    }));
  },

  registerSuggestions: (source, sourceId, suggestionTexts, options) => {
    const normalized = suggestionTexts
      .map(normalizeSuggestionText)
      .filter((text) => text.length > 0);

    if (normalized.length === 0 && !options?.replaceExisting) {
      return;
    }

    set((state) => {
      const existingForSource = state.suggestions.filter(
        (suggestion) => suggestion.source === source && suggestion.sourceId === sourceId
      );

      const uniqueIncoming = Array.from(
        new Set(normalized.map((text) => text.toLowerCase()))
      ).map(
        (textLower) =>
          normalized.find((value) => value.toLowerCase() === textLower) as string
      );

      const existingTextSet = new Set(
        existingForSource.map((suggestion) => suggestion.text.toLowerCase())
      );

      if (options?.replaceExisting) {
        const existingByText = new Map(
          existingForSource.map((suggestion) => [
            suggestion.text.toLowerCase(),
            suggestion,
          ])
        );

        const replacementSuggestions: TrackedSuggestion[] = uniqueIncoming.map(
          (text, index) => {
            const existing = existingByText.get(text.toLowerCase());
            if (existing) {
              return {
                ...existing,
                text,
                isFallback: options?.isFallback === true,
              };
            }

            return {
              id: `${source}-${sourceId}-${Date.now()}-${index}`,
              text,
              acted: false,
              isFallback: options?.isFallback === true,
              source,
              sourceId,
            };
          }
        );

        const noSourceChange =
          replacementSuggestions.length === existingForSource.length &&
          replacementSuggestions.every((suggestion, index) => {
            const current = existingForSource[index];
            return (
              current?.id === suggestion.id &&
              current?.text === suggestion.text &&
              current?.acted === suggestion.acted &&
              current?.isFallback === suggestion.isFallback
            );
          });

        if (noSourceChange) {
          return state;
        }

        const suggestions = [
          ...state.suggestions.filter(
            (suggestion) =>
              !(suggestion.source === source && suggestion.sourceId === sourceId)
          ),
          ...replacementSuggestions,
        ];
        const scannedMessages = getScannedMessagesFromState({
          ...state,
          suggestions,
        });
        const score = calculateScoreFromState({
          ...state,
          suggestions,
          scannedMessages,
        });

        return {
          ...state,
          suggestions,
          scannedMessages,
          lastUpdateTimestamp: Date.now(),
          SafetyScore: score,
          ScoreColor: getScoreColor(score),
        };
      }

      const additions: TrackedSuggestion[] = uniqueIncoming
        .filter((text) => !existingTextSet.has(text.toLowerCase()))
        .map((text, index) => ({
          id: `${source}-${sourceId}-${Date.now()}-${index}`,
          text,
          acted: false,
          isFallback: options?.isFallback === true,
          source,
          sourceId,
        }));

      if (additions.length === 0) {
        return state;
      }

      const suggestions = [...state.suggestions, ...additions];
      const scannedMessages = getScannedMessagesFromState({
        ...state,
        suggestions,
      });
      const score = calculateScoreFromState({
        ...state,
        suggestions,
        scannedMessages,
      });

      return {
        ...state,
        suggestions,
        scannedMessages,
        lastUpdateTimestamp: Date.now(),
        SafetyScore: score,
        ScoreColor: getScoreColor(score),
      };
    });
  },

  recordScannedMessage: (message) => {
    set((state) => {
      const existingIndex = state.scannedMessages.findIndex((item) => item.id === message.id);
      const scannedMessages =
        existingIndex >= 0
          ? state.scannedMessages.map((item) =>
              item.id === message.id ? { ...item, ...message } : item
            )
          : [...state.scannedMessages, message];

      const score = calculateScoreFromState({
        ...state,
        scannedMessages,
      });

      return {
        ...state,
        scannedMessages,
        lastUpdateTimestamp: Date.now(),
        SafetyScore: score,
        ScoreColor: getScoreColor(score),
      };
    });
  },

  markSuggestionAsDone: (id) => {
    set((state) => {
      const current = state.suggestions.find((suggestion) => suggestion.id === id);
      if (!current || current.acted || current.isFallback) {
        return state;
      }

      const suggestions = state.suggestions.map((suggestion) =>
        suggestion.id === id ? { ...suggestion, acted: true } : suggestion
      );
      const scannedMessages = getScannedMessagesFromState({
        ...state,
        suggestions,
      });
      const score = calculateScoreFromState({
        ...state,
        suggestions,
        scannedMessages,
      });

      return {
        ...state,
        suggestions,
        scannedMessages,
        lastUpdateTimestamp: Date.now(),
        SafetyScore: score,
        ScoreColor: getScoreColor(score),
      };
    });
  },

  getSuggestionsForSource: (source, sourceId) => {
    return get().suggestions.filter(
      (suggestion) => suggestion.source === source && suggestion.sourceId === sourceId
    );
  },

  pruneSuggestionsForSource: (source, allowedSourceIds) => {
    set((state) => {
      const allowedSet = new Set(allowedSourceIds);
      const suggestions = state.suggestions.filter(
        (suggestion) => suggestion.source !== source || allowedSet.has(suggestion.sourceId)
      );

      if (suggestions.length === state.suggestions.length) {
        return state;
      }

      const scannedMessages = getScannedMessagesFromState({
        ...state,
        suggestions,
      });
      const score = calculateScoreFromState({
        ...state,
        suggestions,
        scannedMessages,
      });

      return {
        ...state,
        suggestions,
        scannedMessages,
        lastUpdateTimestamp: Date.now(),
        SafetyScore: score,
        ScoreColor: getScoreColor(score),
      };
    });
  },

  refreshScore: () => {
    const s = get();
    const scannedMessages = getScannedMessagesFromState(s);
    const score = calculateScoreFromState({ ...s, scannedMessages });
    set({ SafetyScore: score, ScoreColor: getScoreColor(score) });
  },
}));
