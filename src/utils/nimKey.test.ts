import { maskNimKey, pickNimKey } from "./nimKey";

describe("nimKey", () => {
  it("uses your key over the built-in one", () => {
    expect(pickNimKey("nvapi-mine", "nvapi-bundled", "nvapi-old")).toEqual({ key: "nvapi-mine", source: "yours" });
  });

  it("falls back to the built-in key, then the older stored key", () => {
    expect(pickNimKey(null, "nvapi-bundled", "nvapi-old")).toEqual({ key: "nvapi-bundled", source: "built-in" });
    expect(pickNimKey("  ", undefined, "nvapi-old")).toEqual({ key: "nvapi-old", source: "built-in" });
  });

  it("reports no key when none is set", () => {
    expect(pickNimKey(null, "", null)).toEqual({ key: null, source: "none" });
  });

  it("trims keys and masks all but the last four characters", () => {
    expect(pickNimKey(" nvapi-mine ", null, null).key).toBe("nvapi-mine");
    expect(maskNimKey("nvapi-abcdef123f9a")).toBe("nvapi-••••3f9a");
  });
});
