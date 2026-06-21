import { create } from "zustand";
import { ScanResult } from "../types";
import { classifyMessage } from "../services/nimService";
import { useDashboardStore } from "./dashboardStore";
import { log } from "../utils/activityLog";

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
      log("intercepted", `manual scan | "${text.slice(0, 60)}"`);
      const result = await classifyMessage(text);

      if (get().activeScanRequestId !== requestId) {
        throw new Error("Scan cancelled.");
      }
      log("classified", `${result.classification} (${result.confidence}%) from manual scan`);
      
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
    const isDuplicate = useScannerStore.getState().history.some((r) => r.id === result.id);
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
