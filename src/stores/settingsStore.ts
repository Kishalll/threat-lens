import { create } from "zustand";
import { getSettingsJson, saveSettingsJson } from "../services/storageService";
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from "../utils/settings";

interface SettingsState {
  settings: AppSettings;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: <K extends keyof AppSettings>(section: K, change: Partial<AppSettings[K]>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: async () => {
    try {
      const json = await getSettingsJson();
      set({ settings: mergeSettings(json ? JSON.parse(json) : null), hydrated: true });
    } catch (error) {
      console.warn("[settingsStore] Failed to load settings; using defaults", error);
      set({ hydrated: true });
    }
  },

  update: async (section, change) => {
    const settings = mergeSettings({
      ...get().settings,
      [section]: { ...get().settings[section], ...change },
    });
    set({ settings });
    try {
      await saveSettingsJson(JSON.stringify(settings));
    } catch (error) {
      console.warn("[settingsStore] Failed to save settings", error);
    }
  },
}));
