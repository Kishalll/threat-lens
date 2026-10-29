import type { ScanResult } from "../types";

export type HistoryFilter = "all" | "pending" | "PHISHING" | "SCAM" | "PROMO" | "SAFE";

export const HISTORY_FILTERS: { value: HistoryFilter; label: string; empty: string }[] = [
  { value: "all", label: "All", empty: "No scans yet. Paste a message above." },
  { value: "pending", label: "Pending actions", empty: "No pending actions. You're all caught up." },
  { value: "PHISHING", label: "Phishing", empty: "No phishing messages." },
  { value: "SCAM", label: "Scam", empty: "No scam messages." },
  { value: "PROMO", label: "Promo", empty: "No promotional messages." },
  { value: "SAFE", label: "Safe", empty: "No safe messages." },
];

// pendingByScanId: how many actions are still not done for each scan.
export function matchesHistoryFilter(
  scan: ScanResult,
  filter: HistoryFilter,
  pendingByScanId: ReadonlyMap<string, number>
): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return (pendingByScanId.get(scan.id) ?? 0) > 0;
  return scan.classification === filter;
}

export function countByHistoryFilter(
  history: ScanResult[],
  pendingByScanId: ReadonlyMap<string, number>
): Record<HistoryFilter, number> {
  const counts = { all: 0, pending: 0, PHISHING: 0, SCAM: 0, PROMO: 0, SAFE: 0 };
  for (const scan of history) {
    for (const { value } of HISTORY_FILTERS) {
      if (matchesHistoryFilter(scan, value, pendingByScanId)) counts[value] += 1;
    }
  }
  return counts;
}
