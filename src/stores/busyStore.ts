import { create } from "zustand";

// Protect and verify block the JS thread, so Android holds taps and replays them
// all once the run ends. While a run is busy the app root swallows taps instead.

export type BusyReason = "protect" | "verify";

interface BusyState {
  reason: BusyReason | null;
  blocking: boolean;
}

// Held-back taps arrive right after the run, so keep blocking a little longer.
const RELEASE_DELAY_MS = 300;

export const useBusyStore = create<BusyState>(() => ({ reason: null, blocking: false }));

let releaseTimer: ReturnType<typeof setTimeout> | null = null;

export function startBusy(reason: BusyReason): void {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  useBusyStore.setState({ reason, blocking: true });
}

export function endBusy(): void {
  useBusyStore.setState({ reason: null });
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    useBusyStore.setState({ blocking: false });
  }, RELEASE_DELAY_MS);
}

export const isTouchBlocked = (): boolean => useBusyStore.getState().blocking;
