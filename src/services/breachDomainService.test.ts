import type { BreachApiItem } from "./breachApiService";
import {
  buildBreachAlertPayload,
  executeBreachScan,
} from "./breachDomainService";

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

describe("breachDomainService", () => {
  it("executes a scan through one shared orchestration seam", async () => {
    const outcome = await executeBreachScan({
      credentials: [
        { value: "user@example.com" },
        { value: "user@example.com" },
        { value: "other@example.com" },
      ],
      previousBreaches: [
        makeBreach({
          id: "known",
          resolved: true,
          aiGuidance: "{\"summary\":\"keep\",\"actionItems\":[\"rotate password\"],\"isFallback\":false}",
        }),
      ],
      fetchBreaches: async (credentialValues) => {
        expect(credentialValues).toEqual(["user@example.com", "other@example.com"]);
        return [
          makeBreach({ id: "known", matchedCredential: "user@example.com" }),
          makeBreach({
            id: "new",
            date: "2025-02-01T00:00:00.000Z",
            matchedCredential: "other@example.com",
          }),
        ];
      },
    });

    expect(outcome.breaches.map((breach) => breach.id)).toEqual(["new", "known"]);
    expect(outcome.activeBreachesCount).toBe(1);
    expect(outcome.alertPayload).toMatchObject({
      count: 1,
      breachIds: ["new"],
      credentials: ["other@example.com"],
      credentialSummary: "other@example.com",
    });
    expect(outcome.breaches.find((breach) => breach.id === "known")).toMatchObject({
      resolved: true,
      aiGuidance: expect.stringContaining("keep"),
    });
  });

  it("builds a multi-breach alert payload summary", () => {
    const payload = buildBreachAlertPayload([
      makeBreach({ id: "b-1", matchedCredential: "one@example.com" }),
      makeBreach({ id: "b-2", matchedCredential: "two@example.com" }),
      makeBreach({ id: "b-3", matchedCredential: "three@example.com" }),
    ]);

    expect(payload).toEqual({
      count: 3,
      breachIds: ["b-1", "b-2", "b-3"],
      credentials: ["one@example.com", "two@example.com", "three@example.com"],
      credentialSummary: "one@example.com, two@example.com, and 1 more",
    });
  });
});
