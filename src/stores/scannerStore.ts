import { create } from "zustand";
import { ScanResult } from "../types";
import { classifyMessage } from "../services/nimService";
import { useDashboardStore } from "./dashboardStore";

export interface ScannerState {
  history: ScanResult[];
  isScanning: boolean;
  activeScanRequestId: number;
  
  scanManualText: (text: string) => Promise<ScanResult>;
  recordBackgroundScan: (result: ScanResult) => void;
  cancelScan: () => void;
  clearHistory: () => void;
}

export const useScannerStore = create<ScannerState>()((set, get) => ({
  history: [],
  isScanning: false,
  activeScanRequestId: 0,

  scanManualText: async (text: string) => {
    const requestId = get().activeScanRequestId + 1;
    set({ isScanning: true, activeScanRequestId: requestId });

    try {
      const result = await classifyMessage(text);

      if (get().activeScanRequestId !== requestId) {
        throw new Error("Scan cancelled.");
      }
      
      set((state) => ({
        history: [result, ...state.history],
        isScanning: false
      }));

      // Update Dashboard score metrics
      const dash = useDashboardStore.getState();
      if (result.classification !== "UNAVAILABLE") {
        dash.recordScannedMessage({
          id: result.id,
          riskType: result.classification,
          totalSuggestions: result.suggestedActions.length,
          actedSuggestions: 0,
        });
      }

      dash.updateDashboardData((state) => ({
        lastUpdateTimestamp: state.lastUpdateTimestamp,
      }));

      dash.registerSuggestions("scan", result.id, result.suggestedActions, {
        isFallback: result.classification === "UNAVAILABLE",
      });

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

  recordBackgroundScan: (result: ScanResult) => {
    const DEDUP_WINDOW_MS = 120_000;
    const now = Date.now();
    const isDuplicate = useScannerStore.getState().history.some(
      (r) =>
        r.messagePreview === result.messagePreview &&
        r.classification === result.classification &&
        now - r.timestamp < DEDUP_WINDOW_MS
    );
    if (isDuplicate) return;
    set((state) => ({ history: [result, ...state.history] }));
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
  },

  clearHistory: () => set({ history: [] })
}));