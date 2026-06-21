import { create } from "zustand";
import type { ScanResult } from "../types";
import type { ScannedMessage } from "../utils/scoreCalculator";
import {
  buildScanDashboardState,
  calculateDashboardScore,
  getScannedMessagesFromSuggestions,
  normalizeSuggestionText,
  type SuggestionSource,
  type TrackedSuggestion,
} from "./dashboardDerived";

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
  hydrateScanHistory: (scanResults: ScanResult[]) => void;
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
        const scannedMessages = getScannedMessagesFromSuggestions({
          ...state,
          suggestions,
        });

        return withDerivedState(state, {
          suggestions,
          scannedMessages,
        });
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

  hydrateScanHistory: (scanResults) => {
    set((state) => {
      const scanDerived = buildScanDashboardState(scanResults);
      const suggestions = [
        ...state.suggestions.filter((suggestion) => suggestion.source !== "scan"),
        ...scanDerived.suggestions,
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
    set((state) => {
      const current = state.suggestions.find((suggestion) => suggestion.id === id);
      if (!current || current.acted || current.isFallback) {
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
