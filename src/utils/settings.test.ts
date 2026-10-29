import { DEFAULT_SETTINGS, mergeSettings, retentionCutoff, retentionLabel } from "./settings";

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

  describe("retentionCutoff", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = new Date(2026, 9, 29, 12, 0).getTime();

    it("keeps everything when set to forever", () => {
      expect(retentionCutoff({ mode: "forever", customValue: 30, customUnit: "days" }, now)).toBeNull();
    });

    it("uses fixed day counts for the presets and custom days or weeks", () => {
      expect(retentionCutoff({ mode: "30d", customValue: 1, customUnit: "days" }, now)).toBe(now - 30 * DAY);
      expect(retentionCutoff({ mode: "90d", customValue: 1, customUnit: "days" }, now)).toBe(now - 90 * DAY);
      expect(retentionCutoff({ mode: "custom", customValue: 1, customUnit: "days" }, now)).toBe(now - DAY);
      expect(retentionCutoff({ mode: "custom", customValue: 2, customUnit: "weeks" }, now)).toBe(now - 14 * DAY);
    });

    it("counts custom months on the calendar", () => {
      expect(retentionCutoff({ mode: "custom", customValue: 3, customUnit: "months" }, now)).toBe(
        new Date(2026, 6, 29, 12, 0).getTime()
      );
      const endOfMarch = new Date(2026, 2, 31, 12, 0).getTime();
      expect(retentionCutoff({ mode: "custom", customValue: 1, customUnit: "months" }, endOfMarch)).toBe(
        new Date(2026, 1, 28, 12, 0).getTime()
      );
      const midJanuary = new Date(2026, 0, 15, 12, 0).getTime();
      expect(retentionCutoff({ mode: "custom", customValue: 12, customUnit: "months" }, midJanuary)).toBe(
        new Date(2025, 0, 15, 12, 0).getTime()
      );
    });
  });

  it("describes the retention choice in words", () => {
    expect(retentionLabel({ mode: "30d", customValue: 1, customUnit: "days" })).toBe("30 days");
    expect(retentionLabel({ mode: "custom", customValue: 1, customUnit: "weeks" })).toBe("1 week");
    expect(retentionLabel({ mode: "custom", customValue: 6, customUnit: "months" })).toBe("6 months");
  });
});
