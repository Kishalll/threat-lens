import type { BreachApiItem } from "./breachApiService";
import {
  countActiveBreaches,
  formatCredentialSummary,
  mergeBreachScanResults,
} from "./breachPipeline";

function makeBreach(overrides: Partial<BreachApiItem> = {}): BreachApiItem {
  return {
    id: "breach-1",
    name: "Example Breach",
    domain: "example.com",
    date: "2025-01-01T00:00:00.000Z",
    description: "Example",
    dataClasses: ["Email"],
    source: "XposedOrNot",
    matchedCredential: "user@example.com",
    matchedCredentialType: "email",
    ...overrides,
  };
}

describe("breachPipeline", () => {
  it("preserves resolved and aiGuidance fields while detecting new breaches", () => {
    const previous = [
      makeBreach({
        id: "known",
        resolved: true,
        aiGuidance: "{\"summary\":\"keep\",\"actionItems\":[\"rotate password\"],\"isFallback\":false}",
      }),
    ];

    const fetched = [
      makeBreach({ id: "known", date: "2025-01-02T00:00:00.000Z", aiGuidance: "" }),
      makeBreach({ id: "new", date: "2025-02-01T00:00:00.000Z" }),
    ];

    const outcome = mergeBreachScanResults(previous, fetched, ["user@example.com"]);

    expect(outcome.breaches.map((breach) => breach.id)).toEqual(["new", "known"]);
    expect(outcome.newBreaches.map((breach) => breach.id)).toEqual(["new"]);
    expect(outcome.breaches.find((breach) => breach.id === "known")).toMatchObject({
      resolved: true,
      aiGuidance: previous[0].aiGuidance,
    });
  });

  it("drops breaches for credentials removed during the scan", () => {
    const fetched = [
      makeBreach({ id: "keep", matchedCredential: "keep@example.com" }),
      makeBreach({ id: "drop", matchedCredential: "drop@example.com" }),
    ];

    const outcome = mergeBreachScanResults([], fetched, ["keep@example.com"]);

    expect(outcome.breaches.map((breach) => breach.id)).toEqual(["keep"]);
  });

  it("formats credential summaries and counts unresolved breaches", () => {
    const breaches = [
      makeBreach({ id: "1", matchedCredential: "one@example.com", resolved: false }),
      makeBreach({ id: "2", matchedCredential: "two@example.com", resolved: true }),
      makeBreach({ id: "3", matchedCredential: "three@example.com", resolved: false }),
    ];

    expect(formatCredentialSummary(breaches)).toBe("one@example.com, two@example.com, and 1 more");
    expect(countActiveBreaches(breaches)).toBe(2);
  });
});
