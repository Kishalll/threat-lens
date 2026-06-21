import { calculateSafetyScore } from "../utils/scoreCalculator";
import {
  buildScanDashboardState,
  calculateDashboardScore,
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
        classification: "SPAM",
        confidence: 80,
        messagePreview: "spam",
        redFlags: [],
        suggestedActions: ["Block sender"],
        explanation: "Spam",
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
      { id: "ok", riskType: "SPAM", totalSuggestions: 1, actedSuggestions: 0 },
    ]);
    expect(result.suggestions).toEqual([
      expect.objectContaining({ sourceId: "ok", isFallback: false }),
      expect.objectContaining({ sourceId: "unavailable", isFallback: true }),
    ]);
  });
});
