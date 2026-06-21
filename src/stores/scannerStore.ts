import { create } from "zustand";
import type { ScanResult } from "../types";
import { classifyMessage } from "../services/nimService";
import { createScanRepository, dedupeScanResults } from "../services/scanRepository";
import { getAllScanResults, insertScanResult } from "../services/storageService";
import { useDashboardStore } from "./dashboardStore";
import { log } from "../utils/activityLog";

const scanRepository = createScanRepository({
  insertScanResult,
  getAllScanResults,
});

function appendScanToHistory(history: ScanResult[], result: ScanResult): ScanResult[] {
  return dedupeScanResults([result, ...history]);
}

function syncHistoryToDashboard(history: ScanResult[]): void {
  useDashboardStore.getState().hydrateScanHistory(history);
}

function recordScanInDashboard(result: ScanResult): void {
  const dash = useDashboardStore.getState();
  if (result.classification !== "UNAVAILABLE") {
    dash.recordScannedMessage({
      id: result.id,
      riskType: result.classification,
      totalSuggestions: result.suggestedActions.length,
      actedSuggestions: 0,
    });
  }

  dash.registerSuggestions("scan", result.id, result.suggestedActions, {
    isFallback: result.classification === "UNAVAILABLE",
  });
}

export interface ScannerState {
  history: ScanResult[];
  isScanning: boolean;
  activeScanRequestId: number;
  
  hydrateFromStorage: () => Promise<void>;
  scanManualText: (text: string) => Promise<ScanResult>;
  recordBackgroundScan: (result: ScanResult) => Promise<void>;
  cancelScan: () => void;
  clearHistory: () => void;
}

export const useScannerStore = create<ScannerState>()((set, get) => ({
  history: [],
  isScanning: false,
  activeScanRequestId: 0,

  hydrateFromStorage: async () => {
    const history = await scanRepository.loadHistory();
    set({ history });
    syncHistoryToDashboard(history);
  },

  scanManualText: async (text: string) => {
    const requestId = get().activeScanRequestId + 1;
    set({ isScanning: true, activeScanRequestId: requestId });

    try {
      log("intercepted", `manual scan | "${text.slice(0, 60)}"`);
      const result = await classifyMessage(text);

      if (get().activeScanRequestId !== requestId) {
        throw new Error("Scan cancelled.");
      }
      log("classified", `${result.classification} (${result.confidence}%) from manual scan`);

      await scanRepository.save(result);

      set((state) => ({ history: appendScanToHistory(state.history, result), isScanning: false }));
      recordScanInDashboard(result);

      return result;
    } catch (error) {
      if (get().activeScanRequestId !== requestId || (error instanceof Error && error.message === "Scan cancelled.")) {
        set({ isScanning: false });
        throw new Error("Scan cancelled.");
      }

      console.error(error);
      set({ isScanning: false });
      throw error;
    }
  },

  cancelScan: () =>
    set((state) => ({
      isScanning: false,
      activeScanRequestId: state.activeScanRequestId + 1,
    })),

  recordBackgroundScan: async (result: ScanResult) => {
    const isDuplicate = get().history.some((record) => record.id === result.id);
    if (isDuplicate) {
      return;
    }

    await scanRepository.save(result);
    set((state) => ({ history: appendScanToHistory(state.history, result) }));
    recordScanInDashboard(result);
  },

  clearHistory: () => set({ history: [] })
}));
