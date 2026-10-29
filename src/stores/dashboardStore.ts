import { create } from "zustand";
import type { ScanResult } from "../types";
import type { ScannedMessage } from "../utils/scoreCalculator";
import {
  buildScanDashboardState,
  suggestionId,
  uniqueSuggestionTexts,
  calculateDashboardScore,
  getScannedMessagesFromSuggestions,
  type SuggestionSource,
  type TrackedSuggestion,
} from "./dashboardDerived";
import {
  getActedSuggestionIds,
  insertActedSuggestion,
} from "../services/storageService";

export type { SuggestionSource, TrackedSuggestion } from "./dashboardDerived";

function withDerivedState(
  state: DashboardState,
  patch: Partial<DashboardState>
): DashboardState {
  const nextState = {
    ...state,
    ...patch,
    lastUpdateTimestamp: Date.now(),
  };

  return {
    ...nextState,
    ...calculateDashboardScore(nextState),
  };
}

// Ids of actions ticked as done, as saved in the database. Loaded with the scan
// history and kept in step with each new tick, so actions registered later
// (breach guidance, a re-opened scan) come back already ticked.
let savedActedIds = new Set<string>();

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
  hydrateScanHistory: (scanResults: ScanResult[]) => Promise<void>;
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
      return withDerivedState(state, patch);
    });
  },

  incrementProtectedImagesCount: () => {
    get().updateDashboardData((state) => ({
      protectedImagesCount: state.protectedImagesCount + 1,
    }));
  },

  registerSuggestions: (source, sourceId, suggestionTexts, options) => {
    const incoming = uniqueSuggestionTexts(suggestionTexts);

    if (incoming.length === 0 && !options?.replaceExisting) {
      return;
    }

    set((state) => {
      const existingForSource = state.suggestions.filter(
        (suggestion) => suggestion.source === source && suggestion.sourceId === sourceId
      );
      const existingByText = new Map(
        existingForSource.map((suggestion) => [suggestion.text.toLowerCase(), suggestion])
      );

      // Ids follow the action's position, so a tick saved before a restart is found again.
      const build = (text: string, index: number): TrackedSuggestion => {
        const id = suggestionId(source, sourceId, index);
        const existing = existingByText.get(text.toLowerCase());
        return {
          id,
          text,
          acted: existing?.acted === true || savedActedIds.has(id),
          isFallback: options?.isFallback === true,
          source,
          sourceId,
        };
      };

      let suggestions: TrackedSuggestion[];
      if (options?.replaceExisting) {
        const replacements = incoming.map(build);
        const unchanged =
          replacements.length === existingForSource.length &&
          replacements.every((suggestion, index) => {
            const current = existingForSource[index];
            return (
              current?.id === suggestion.id &&
              current?.text === suggestion.text &&
              current?.acted === suggestion.acted &&
              current?.isFallback === suggestion.isFallback
            );
          });
        if (unchanged) {
          return state;
        }
        suggestions = [
          ...state.suggestions.filter(
            (suggestion) => !(suggestion.source === source && suggestion.sourceId === sourceId)
          ),
          ...replacements,
        ];
      } else {
        const additions = incoming
          .map(build)
          .filter((suggestion) => !existingByText.has(suggestion.text.toLowerCase()));
        if (additions.length === 0) {
          return state;
        }
        suggestions = [...state.suggestions, ...additions];
      }

      const scannedMessages = getScannedMessagesFromSuggestions({
        ...state,
        suggestions,
      });

      return withDerivedState(state, {
        suggestions,
        scannedMessages,
      });
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

      return withDerivedState(state, { scannedMessages });
    });
  },

  hydrateScanHistory: async (scanResults) => {
    let actedIds: Set<string>;
    try {
      actedIds = await getActedSuggestionIds();
    } catch (error) {
      console.warn(
        "[dashboardStore] Failed to load acted suggestions; continuing with empty set",
        error
      );
      // Keep the ticks already known this session rather than forgetting them.
      actedIds = new Set(savedActedIds);
    }

    savedActedIds = actedIds;

    set((state) => {
      const scanDerived = buildScanDashboardState(scanResults);
      const scanSuggestions = scanDerived.suggestions.map((suggestion) => ({
        ...suggestion,
        acted: suggestion.acted || actedIds.has(suggestion.id),
      }));
      const suggestions = [
        ...state.suggestions.filter((suggestion) => suggestion.source !== "scan"),
        ...scanSuggestions,
      ];
      const scannedMessages = getScannedMessagesFromSuggestions({
        ...state,
        suggestions,
        scannedMessages: scanDerived.scannedMessages,
      });

      return withDerivedState(state, {
        suggestions,
        scannedMessages,
      });
    });
  },

  markSuggestionAsDone: (id) => {
    const current = get().suggestions.find((suggestion) => suggestion.id === id);
    const shouldPersist = !!current && !current.acted && !current.isFallback;

    set((state) => {
      const currentInState = state.suggestions.find((suggestion) => suggestion.id === id);
      if (!currentInState || currentInState.acted || currentInState.isFallback) {
        return state;
      }

      const suggestions = state.suggestions.map((suggestion) =>
        suggestion.id === id ? { ...suggestion, acted: true } : suggestion
      );
      const scannedMessages = getScannedMessagesFromSuggestions({
        ...state,
        suggestions,
      });

      return withDerivedState(state, {
        suggestions,
        scannedMessages,
      });
    });

    if (shouldPersist) {
      savedActedIds.add(id);
      insertActedSuggestion(id).catch((error) => {
        console.warn(
          "[dashboardStore] Failed to persist acted suggestion",
          error
        );
      });
    }
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

      const scannedMessages = getScannedMessagesFromSuggestions({
        ...state,
        suggestions,
      });

      return withDerivedState(state, {
        suggestions,
        scannedMessages,
      });
    });
  },

  refreshScore: () => {
    const s = get();
    const scannedMessages = getScannedMessagesFromSuggestions(s);
    set(withDerivedState(s, { scannedMessages }));
  },
}));
