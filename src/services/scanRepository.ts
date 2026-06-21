import type { ScanResult } from "../types";

export interface ScanHistoryStorage {
  insertScanResult: (result: ScanResult) => Promise<void>;
  getAllScanResults: () => Promise<ScanResult[]>;
}

export interface ScanRepository {
  save: (result: ScanResult) => Promise<void>;
  loadHistory: () => Promise<ScanResult[]>;
}

export function sortScanResultsNewestFirst(results: ScanResult[]): ScanResult[] {
  return [...results].sort((a, b) => b.timestamp - a.timestamp);
}

export function dedupeScanResults(results: ScanResult[]): ScanResult[] {
  const byId = new Map<string, ScanResult>();
  for (const result of sortScanResultsNewestFirst(results)) {
    if (!byId.has(result.id)) {
      byId.set(result.id, result);
    }
  }
  return Array.from(byId.values());
}

export function createScanRepository(storage: ScanHistoryStorage): ScanRepository {
  return {
    async save(result: ScanResult): Promise<void> {
      await storage.insertScanResult(result);
    },
    async loadHistory(): Promise<ScanResult[]> {
      return dedupeScanResults(await storage.getAllScanResults());
    },
  };
}
