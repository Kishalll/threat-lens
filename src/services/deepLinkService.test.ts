import {
  buildNotificationDeepLink,
  parseThreatLensUrl,
} from "./deepLinkService";

describe("deepLinkService", () => {
  it("builds scan alert deep links with encoded result payloads", () => {
    expect(
      buildNotificationDeepLink({ encodedResult: "abc123", threatlensInternal: true })
    ).toBe("threatlens://scan/result?data=abc123");
  });

  it("builds breach and paste-prompt deep links", () => {
    expect(
      buildNotificationDeepLink({ type: "BREACH_ALERT", breachIds: ["b-1"] })
    ).toBe("threatlens://breach/b-1");
    expect(
      buildNotificationDeepLink({ type: "BREACH_ALERT", breachIds: ["b-1", "b-2"] })
    ).toBe("threatlens://breach");
    expect(
      buildNotificationDeepLink({
        type: "PASTE_FULL_NOTIFICATION_PROMPT",
        capturedText: "need help now",
      })
    ).toBe("threatlens://scanner?prefill=need%20help%20now");
  });

  it("parses notification and shared-text routes", () => {
    expect(parseThreatLensUrl("threatlens://scan/result?data=encoded")).toEqual({
      type: "scan-result",
      encodedResult: "encoded",
      source: "notification",
    });
    expect(parseThreatLensUrl("threatlens://breach/b-2")).toEqual({
      type: "breach-detail",
      breachId: "b-2",
    });
    expect(parseThreatLensUrl("threatlens://scanner?prefill=paste%20me")).toEqual({
      type: "scanner-prefill",
      prefill: "paste me",
    });
    expect(parseThreatLensUrl("threatlens://share?text=hello")).toEqual({
      type: "shared-text",
      text: "hello",
    });
  });
});
