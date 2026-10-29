import { DEFAULT_SETTINGS, mergeSettings } from "./settings";

describe("settings", () => {
  it("returns the defaults when nothing was saved", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings("not an object")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps saved values and fills in anything missing", () => {
    const merged = mergeSettings({ breach: { alerts: false }, scanner: { disabledApps: ["com.whatsapp"] } });
    expect(merged.breach.alerts).toBe(false);
    expect(merged.breach.intervalHours).toBe(6);
    expect(merged.scanner.disabledApps).toEqual(["com.whatsapp"]);
    expect(merged.scanner.interceptionEnabled).toBe(true);
    expect(merged.general).toEqual(DEFAULT_SETTINGS.general);
  });

  it("falls back on values outside the allowed choices", () => {
    const merged = mergeSettings({
      breach: { intervalHours: 1, backgroundChecks: "yes" },
      general: { theme: "blue" },
      scanner: { retention: { mode: "1y" }, disabledApps: ["com.whatsapp", 42] },
    });
    expect(merged.breach.intervalHours).toBe(6);
    expect(merged.breach.backgroundChecks).toBe(true);
    expect(merged.general.theme).toBe("dark");
    expect(merged.scanner.retention.mode).toBe("forever");
    expect(merged.scanner.disabledApps).toEqual(["com.whatsapp"]);
  });

  it("caps custom retention at one year in each unit", () => {
    const ok = mergeSettings({ scanner: { retention: { mode: "custom", customValue: 12, customUnit: "months" } } });
    expect(ok.scanner.retention).toEqual({ mode: "custom", customValue: 12, customUnit: "months" });

    const tooLong = mergeSettings({ scanner: { retention: { mode: "custom", customValue: 13, customUnit: "months" } } });
    expect(tooLong.scanner.retention.customValue).toBe(12);

    const fractional = mergeSettings({ scanner: { retention: { customValue: 2.5, customUnit: "weeks" } } });
    expect(fractional.scanner.retention.customValue).toBe(30);
  });
});
