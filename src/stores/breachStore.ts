import { create } from "zustand";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { BreachApiItem, checkAllCredentials } from "../services/breachApiService";
import {
  getCachedBreaches,
  getCredentials,
  replaceCachedBreaches,
  replaceCredentials,
  type StoredCredential,
} from "../services/storageService";
import { sendLocalNotification } from "../services/notificationService";
import { generateBreachGuidance } from "../services/nimService";
import { useDashboardStore } from "./dashboardStore";

// Type mapping for credentials
export type Credential = {
  id: string;
  value: string; // emails or usernames
  type: "email" | "username";
};

export interface BreachState {
  credentials: Credential[];
  breaches: BreachApiItem[];
  isScanning: boolean;
  lastScanTimestamp: number;
  scanError: string | null;
  isHydrated: boolean;
  
  addCredential: (value: string, type: "email" | "username") => void;
  removeCredential: (id: string) => void;
  markBreachAsResolved: (id: string) => void;
  syncBreachResolutionFromSuggestions: (resolutionById: Record<string, boolean>) => void;
  saveBreachGuidance: (
    id: string,
    guidance: { summary: string; actionItems: string[]; isFallback: boolean }
  ) => void;
  requestBreachGuidance: (id: string) => Promise<void>;
  runScan: (options?: { notifyOnNew?: boolean }) => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
}

function sortBreachesNewestFirst(breaches: BreachApiItem[]): BreachApiItem[] {
  return [...breaches].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return bTime - aTime;
  });
}

function toStoredCredentials(credentials: Credential[]): StoredCredential[] {
  return credentials.map((credential) => ({
    id: credential.id,
    value: credential.value,
    type: credential.type,
  }));
}

function formatCredentialSummary(breaches: BreachApiItem[]): string {
  const values = Array.from(
    new Set(
      breaches
        .map((breach) => breach.matchedCredential)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  );

  if (values.length === 0) {
    return "your monitored accounts";
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values[0]}, ${values[1]}, and ${values.length - 2} more`;
}

function countActiveBreaches(breaches: BreachApiItem[]): number {
  return breaches.filter((breach) => !breach.resolved).length;
}

function applyResolvedState(
  breaches: BreachApiItem[],
  resolvedById: Map<string, boolean>
): BreachApiItem[] {
  return breaches.map((breach) => ({
    ...breach,
    resolved: resolvedById.get(breach.id) ?? Boolean(breach.resolved),
  }));
}

function applyPersistedBreachFields(
  breaches: BreachApiItem[],
  previousById: Map<string, BreachApiItem>
): BreachApiItem[] {
  return breaches.map((breach) => {
    const previous = previousById.get(breach.id);
    if (!previous) {
      return breach;
    }

    return {
      ...breach,
      resolved: Boolean(previous.resolved),
      aiGuidance:
        typeof previous.aiGuidance === "string" && previous.aiGuidance.trim().length > 0
          ? previous.aiGuidance
          : breach.aiGuidance,
    };
  });
}

function persistCredentialsAsync(credentials: StoredCredential[]): void {
  void replaceCredentials(credentials).catch((error) => {
    console.error("Failed to persist credentials", error);
  });
}

function persistBreachCacheAsync(breaches: BreachApiItem[]): void {
  void replaceCachedBreaches(breaches).catch((error) => {
    console.error("Failed to persist breach cache", error);
  });
}

function parseStoredGuidance(
  value?: string
): { summary: string; actionItems: string[]; isFallback: boolean } | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { summary?: unknown }).summary === "string" &&
      Array.isArray((parsed as { actionItems?: unknown }).actionItems)
    ) {
      return {
        summary: (parsed as { summary: string }).summary,
        actionItems: (parsed as { actionItems: unknown[] }).actionItems.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        ),
        isFallback: Boolean((parsed as { isFallback?: unknown }).isFallback),
      };
    }
  } catch {
    return {
      summary: value.trim(),
      actionItems: [],
      isFallback: false,
    };
  }

  return null;
}

function deriveResolvedOnHydration(breach: BreachApiItem): boolean {
  const guidance = parseStoredGuidance(breach.aiGuidance ?? undefined);

  // Without persisted per-action completion state, be conservative on startup.
  // A breach is considered resolved at hydration only when guidance exists and
  // there are no required action items.
  if (!guidance || guidance.isFallback) {
    return false;
  }

  return guidance.actionItems.length === 0;
}

export const useBreachStore = create<BreachState>()((set, get) => ({
  credentials: [],
  breaches: [],
  isScanning: false,
  lastScanTimestamp: 0,
  scanError: null,
  isHydrated: false,

  addCredential: (value, type) => {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    set((state) => {
      const exists = state.credentials.find(
        (c) => c.value.toLowerCase() === normalized.toLowerCase()
      );
      if (exists) return state;

      const nextCredentials = [
        ...state.credentials,
        { id: uuidv4(), value: normalized, type },
      ];

      persistCredentialsAsync(toStoredCredentials(nextCredentials));

      return {
        credentials: nextCredentials,
        scanError: null,
      };
    });

    // Start scan on credential add
    void get().runScan({ notifyOnNew: true });
  },

  removeCredential: (id) => {
    let nextActiveBreachesCount = 0;
    let nextBreachIds: string[] = [];

    set((state) => {
      const nextCredentials = state.credentials.filter((c) => c.id !== id);
      const allowedValues = new Set(nextCredentials.map((credential) => credential.value));
      const nextBreaches = state.breaches.filter((breach) => {
        if (!breach.matchedCredential) {
          return true;
        }
        return allowedValues.has(breach.matchedCredential);
      });

      nextActiveBreachesCount = countActiveBreaches(nextBreaches);
      nextBreachIds = nextBreaches.map((breach) => breach.id);

      persistCredentialsAsync(toStoredCredentials(nextCredentials));
      persistBreachCacheAsync(nextBreaches);

      return {
        credentials: nextCredentials,
        breaches: nextBreaches,
      };
    });

    useDashboardStore.getState().updateDashboardData({
      activeBreachesCount: nextActiveBreachesCount,
    });
    useDashboardStore.getState().pruneSuggestionsForSource("breach", nextBreachIds);
  },

  markBreachAsResolved: (id) => {
    let didUpdate = false;
    let nextActiveBreachesCount = 0;

    set((state) => {
      const target = state.breaches.find((breach) => breach.id === id);
      if (!target || target.resolved) {
        return state;
      }

      didUpdate = true;
      const breaches = state.breaches.map((breach) =>
        breach.id === id ? { ...breach, resolved: true } : breach
      );

      nextActiveBreachesCount = countActiveBreaches(breaches);

      persistBreachCacheAsync(breaches);

      return {
        ...state,
        breaches,
      };
    });

    if (didUpdate) {
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: nextActiveBreachesCount,
      });
    }
  },

  syncBreachResolutionFromSuggestions: (resolutionById) => {
    const currentBreaches = get().breaches;
    const hasAnyChange = currentBreaches.some((breach) => {
      const nextResolved = resolutionById[breach.id];
      return (
        typeof nextResolved === "boolean" &&
        Boolean(breach.resolved) !== nextResolved
      );
    });

    if (!hasAnyChange) {
      return;
    }

    let nextActiveBreachesCount = 0;

    set((state) => {
      const nextBreaches = state.breaches.map((breach) => {
        const nextResolved = resolutionById[breach.id];
        if (typeof nextResolved !== "boolean") {
          return breach;
        }

        if (Boolean(breach.resolved) === nextResolved) {
          return breach;
        }

        return {
          ...breach,
          resolved: nextResolved,
        };
      });

      nextActiveBreachesCount = countActiveBreaches(nextBreaches);
      persistBreachCacheAsync(nextBreaches);

      return {
        ...state,
        breaches: nextBreaches,
      };
    });

    useDashboardStore.getState().updateDashboardData({
      activeBreachesCount: nextActiveBreachesCount,
    });
  },

  saveBreachGuidance: (id, guidance) => {
    set((state) => {
      const target = state.breaches.find((breach) => breach.id === id);
      if (!target) {
        return state;
      }

      const serializedGuidance = JSON.stringify(guidance);
      const breaches = state.breaches.map((breach) =>
        breach.id === id ? { ...breach, aiGuidance: serializedGuidance } : breach
      );

      persistBreachCacheAsync(breaches);

      return {
        ...state,
        breaches,
      };
    });
  },

  requestBreachGuidance: async (id) => {
    const breach = get().breaches.find((item) => item.id === id);
    if (!breach) {
      return;
    }

    const cachedGuidance = parseStoredGuidance(breach.aiGuidance ?? undefined);
    if (cachedGuidance) {
      return;
    }

    const guidance = await generateBreachGuidance(breach);
    if (guidance.isFallback) {
      throw new Error("AI guidance is temporarily unavailable. Please try reopening this breach.");
    }

    get().saveBreachGuidance(id, guidance);
  },

  hydrateFromStorage: async () => {
    try {
      const [credentials, breaches] = await Promise.all([
        getCredentials(),
        getCachedBreaches(),
      ]);

      const sortedBreaches = sortBreachesNewestFirst(breaches).map((breach) => ({
        ...breach,
        resolved: deriveResolvedOnHydration(breach),
      }));

      set({
        credentials,
        breaches: sortedBreaches,
        isHydrated: true,
      });

      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: countActiveBreaches(sortedBreaches),
      });
      useDashboardStore
        .getState()
        .pruneSuggestionsForSource("breach", sortedBreaches.map((breach) => breach.id));
    } catch (error) {
      console.error("Failed to hydrate breach data", error);
      set({ isHydrated: true });
    }
  },

  runScan: async (options = {}) => {
    if (get().isScanning) {
      return;
    }

    const notifyOnNew = options.notifyOnNew === true;
    const currentCredentials = get().credentials;

    if (currentCredentials.length === 0) {
      set({ breaches: [], isScanning: false, scanError: null });
      persistBreachCacheAsync([]);
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: 0,
      });
      useDashboardStore.getState().pruneSuggestionsForSource("breach", []);
      return;
    }

    set({ isScanning: true, scanError: null });
    
    try {
      const previousBreaches = get().breaches;
      const previousIds = new Set(previousBreaches.map((breach) => breach.id));
      const previousById = new Map(previousBreaches.map((breach) => [breach.id, breach]));
      const resolvedById = new Map(
        previousBreaches.map((breach) => [breach.id, Boolean(breach.resolved)])
      );

      const itemsToScan = get().credentials.map((c) => c.value);
      const results = await checkAllCredentials(itemsToScan);

      // Drop results for credentials deleted while the scan was running
      const currentValues = new Set(get().credentials.map((c) => c.value));
      const activeResults = results.filter(
        (b) => !b.matchedCredential || currentValues.has(b.matchedCredential)
      );

      const sortedResults = applyPersistedBreachFields(
        applyResolvedState(sortBreachesNewestFirst(activeResults), resolvedById),
        previousById
      );
      const newBreaches = sortedResults.filter((breach) => !previousIds.has(breach.id));
      
      set({ 
        breaches: sortedResults,
        lastScanTimestamp: Date.now(),
        isScanning: false,
        scanError: null,
      });

      persistBreachCacheAsync(sortedResults);
      persistCredentialsAsync(toStoredCredentials(get().credentials));

      // Update the dashboard store with the count
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: countActiveBreaches(sortedResults)
      });
      useDashboardStore
        .getState()
        .pruneSuggestionsForSource("breach", sortedResults.map((breach) => breach.id));

      if (notifyOnNew && newBreaches.length > 0) {
        const credentialSummary = formatCredentialSummary(newBreaches);
        await sendLocalNotification(
          "New Data Breach Detected",
          `New breach data found for ${credentialSummary}. Tap to review in Breach tab.`,
          {
            type: "BREACH_ALERT",
            breachIds: newBreaches.map((breach) => breach.id),
            credentials: newBreaches
              .map((breach) => breach.matchedCredential)
              .filter((value): value is string => typeof value === "string" && value.length > 0),
            threatlensInternal: true,
          }
        );
      }

    } catch (error) {
      console.error("Scan failed", error);
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Breach data fetch failed. Please try again.";

      set({
        breaches: [],
        isScanning: false,
        scanError: `${message} Please try again.`,
      });

      persistBreachCacheAsync([]);
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: 0,
      });
      useDashboardStore.getState().pruneSuggestionsForSource("breach", []);
    }
  }
}));
