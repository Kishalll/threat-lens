import type { ScanResult } from "../types";
import { createScanRepository, dedupeScanResults } from "./scanRepository";

function makeScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    id: "scan-1",
    timestamp: 100,
    classification: "SAFE",
    confidence: 80,
    messagePreview: "hello",
    redFlags: [],
    suggestedActions: [],
    explanation: "fine",
    ...overrides,
  };
}

describe("scanRepository", () => {
  it("loads newest-first deduped history", async () => {
    const saved: ScanResult[] = [
      makeScan({ id: "older", timestamp: 10 }),
      makeScan({ id: "newer", timestamp: 30 }),
      makeScan({ id: "older", timestamp: 10 }),
    ];

    const repository = createScanRepository({
      insertScanResult: async () => undefined,
      getAllScanResults: async () => saved,
    });

    await expect(repository.loadHistory()).resolves.toEqual([
      expect.objectContaining({ id: "newer", timestamp: 30 }),
      expect.objectContaining({ id: "older", timestamp: 10 }),
    ]);
  });

  it("persists all scan sources through the same save seam", async () => {
    const persisted: ScanResult[] = [];
    const repository = createScanRepository({
      insertScanResult: async (result) => {
        persisted.push(result);
      },
      getAllScanResults: async () => persisted,
    });

    const manual = makeScan({ id: "manual", timestamp: 1 });
    const foreground = makeScan({ id: "foreground", timestamp: 2 });
    const background = makeScan({ id: "background", timestamp: 3 });
    const recovered = makeScan({ id: "recovered", timestamp: 4 });

    await repository.save(manual);
    await repository.save(foreground);
    await repository.save(background);
    await repository.save(recovered);

    expect(persisted.map((result) => result.id)).toEqual([
      "manual",
      "foreground",
      "background",
      "recovered",
    ]);
  });

  it("dedupes duplicate recovered scans by id", () => {
    const history = dedupeScanResults([
      makeScan({ id: "duplicate", timestamp: 10 }),
      makeScan({ id: "duplicate", timestamp: 10 }),
      makeScan({ id: "unique", timestamp: 20 }),
    ]);

    expect(history.map((result) => result.id)).toEqual(["unique", "duplicate"]);
  });
});
