import type { ScanResult } from "../types";
import { countByHistoryFilter, matchesHistoryFilter } from "./historyFilters";

function scan(id: string, classification: ScanResult["classification"]): ScanResult {
  return {
    id,
    timestamp: 1,
    classification,
    confidence: 90,
    messagePreview: id,
    redFlags: [],
    suggestedActions: [],
    explanation: "",
  };
}

const history = [scan("a", "PHISHING"), scan("b", "SCAM"), scan("c", "SAFE"), scan("d", "PROMO"), scan("e", "UNAVAILABLE")];
const pending = new Map([["a", 2], ["b", 0]]);

describe("historyFilters", () => {
  it("filters by classification, by pending actions, or not at all", () => {
    expect(history.filter((s) => matchesHistoryFilter(s, "PHISHING", pending)).map((s) => s.id)).toEqual(["a"]);
    expect(history.filter((s) => matchesHistoryFilter(s, "pending", pending)).map((s) => s.id)).toEqual(["a"]);
    expect(history.filter((s) => matchesHistoryFilter(s, "all", pending))).toHaveLength(5);
  });

  it("counts every filter, with unavailable scans only under All", () => {
    expect(countByHistoryFilter(history, pending)).toEqual({
      all: 5,
      pending: 1,
      PHISHING: 1,
      SCAM: 1,
      PROMO: 1,
      SAFE: 1,
    });
  });
});
