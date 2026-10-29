import { calculateSafetyScore } from "../utils/scoreCalculator";
import {
  DEFAULT_THREAT_ACTIONS,
  buildScanDashboardState,
  calculateDashboardScore,
  effectiveSuggestedActions,
  getScannedMessagesFromSuggestions,
  type DashboardStateSlice,
  type TrackedSuggestion,
} from "./dashboardDerived";

function makeState(overrides: Partial<DashboardStateSlice> = {}): DashboardStateSlice {
  return {
    activeBreachesCount: 2,
    protectedImagesCount: 3,
    scannedMessages: [
      { id: "scan-1", riskType: "PHISHING", totalSuggestions: 2, actedSuggestions: 0 },
      { id: "scan-2", riskType: "SAFE", totalSuggestions: 0, actedSuggestions: 0 },
    ],
    suggestions: [
      { id: "scan-s-1", text: "Change password", acted: true, isFallback: false, source: "scan", sourceId: "scan-1" },
      { id: "scan-s-2", text: "Enable 2FA", acted: false, isFallback: false, source: "scan", sourceId: "scan-1" },
      { id: "breach-s-1", text: "Rotate password", acted: true, isFallback: false, source: "breach", sourceId: "breach-1" },
      { id: "breach-s-2", text: "Review sessions", acted: false, isFallback: false, source: "breach", sourceId: "breach-1" },
      { id: "breach-s-3", text: "Cached fallback", acted: false, isFallback: true, source: "breach", sourceId: "breach-2" },
    ],
    ...overrides,
  };
}

describe("dashboardDerived", () => {
  it("preserves score math by translating derived state into score inputs", () => {
    const state = makeState();
    const score = calculateDashboardScore(state);

    expect(score).toEqual({
      SafetyScore: calculateSafetyScore({
        activeBreachesCount: 2,
        protectedImagesCount: 3,
        scannedMessages: state.scannedMessages,
        breachActionProgress: {
          totalSuggestions: 2,
          actedSuggestions: 1,
          resolvedBreachEquivalent: 0.5,
          pendingBreachCount: 1,
        },
        hasPendingActions: true,
      }),
      ScoreColor: "#83D0AE",
    });
  });

  it("recomputes scan acted suggestion counts from tracked suggestions", () => {
    const suggestions: TrackedSuggestion[] = [
      { id: "a", text: "step 1", acted: true, isFallback: false, source: "scan", sourceId: "scan-1" },
      { id: "b", text: "step 2", acted: false, isFallback: false, source: "scan", sourceId: "scan-1" },
    ];

    expect(
      getScannedMessagesFromSuggestions({
        scannedMessages: [{ id: "scan-1", riskType: "SCAM", totalSuggestions: 1, actedSuggestions: 0 }],
        suggestions,
      })
    ).toEqual([
      { id: "scan-1", riskType: "SCAM", totalSuggestions: 2, actedSuggestions: 1 },
    ]);
  });

  it("keeps unavailable scans out of scanned-message score inputs while retaining fallback suggestions", () => {
    const result = buildScanDashboardState([
      {
        id: "ok",
        timestamp: 1,
        classification: "SCAM",
        confidence: 80,
        messagePreview: "scam",
        redFlags: [],
        suggestedActions: ["Block sender"],
        explanation: "Scam",
      },
      {
        id: "unavailable",
        timestamp: 2,
        classification: "UNAVAILABLE",
        confidence: 0,
        messagePreview: "quota",
        redFlags: [],
        suggestedActions: ["Retry later"],
        explanation: "Unavailable",
      },
    ]);

    expect(result.scannedMessages).toEqual([
      { id: "ok", riskType: "SCAM", totalSuggestions: 1, actedSuggestions: 0 },
    ]);
    expect(result.suggestions).toEqual([
      expect.objectContaining({ sourceId: "ok", isFallback: false }),
      expect.objectContaining({ sourceId: "unavailable", isFallback: true }),
    ]);
  });

  it("gives scam and phishing results default actions when the model suggested none", () => {
    expect(effectiveSuggestedActions({ classification: "SCAM", suggestedActions: [] })).toEqual(DEFAULT_THREAT_ACTIONS);
    expect(effectiveSuggestedActions({ classification: "PHISHING", suggestedActions: ["  "] })).toEqual(DEFAULT_THREAT_ACTIONS);
    expect(effectiveSuggestedActions({ classification: "SAFE", suggestedActions: [] })).toEqual([]);
    expect(effectiveSuggestedActions({ classification: "SCAM", suggestedActions: ["Block", "block "] })).toEqual(["Block"]);
  });

  it("uses position-based ids so saved ticks match after a restart", () => {
    const result = buildScanDashboardState([
      {
        id: "s1",
        timestamp: 1,
        classification: "SCAM",
        confidence: 90,
        messagePreview: "pay now",
        redFlags: [],
        suggestedActions: [],
        explanation: "scam",
      },
    ]);
    expect(result.suggestions.map((s) => s.id)).toEqual(["scan-s1-0", "scan-s1-1"]);
    expect(result.scannedMessages[0]).toEqual(expect.objectContaining({ totalSuggestions: 2 }));
  });

  it("recovers part of the penalty per action done and reaches 100 once all are done", () => {
    const pending: TrackedSuggestion = { id: "scan-s1-1", text: "Delete", acted: false, isFallback: false, source: "scan", sourceId: "s1" };
    const done: TrackedSuggestion = { id: "scan-s1-0", text: "Block", acted: true, isFallback: false, source: "scan", sourceId: "s1" };
    const base: DashboardStateSlice = {
      activeBreachesCount: 0,
      protectedImagesCount: 0,
      scannedMessages: [{ id: "s1", riskType: "PHISHING", totalSuggestions: 2, actedSuggestions: 1 }],
      suggestions: [done, pending],
    };
    // Phishing costs 5; one of two actions done recovers half: 97.5 rounds to 98.
    expect(calculateDashboardScore(base).SafetyScore).toBe(98);

    const allDone: DashboardStateSlice = {
      ...base,
      scannedMessages: [{ id: "s1", riskType: "PHISHING", totalSuggestions: 2, actedSuggestions: 2 }],
      suggestions: [done, { ...pending, acted: true }],
    };
    expect(calculateDashboardScore(allDone).SafetyScore).toBe(100);
  });
});
