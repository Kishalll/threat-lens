import { NativeModules, Platform } from "react-native";
import type { AppSettings } from "../utils/settings";
import type { NimKeySource } from "../utils/nimKey";
import { getActiveNimKey } from "./secureKeyService";

export interface InstalledApp {
  packageName: string;
  label: string;
}

// The native listener and the killed-app worker read the scanner switches from
// shared preferences, so every change is copied there.
export function syncScannerSettingsToNative(scanner: AppSettings["scanner"]): void {
  if (Platform.OS !== "android" || !NativeModules.NotificationModule?.setScannerSettings) {
    return;
  }
  NativeModules.NotificationModule.setScannerSettings(JSON.stringify(scanner));
}

// The killed-app worker calls NVIDIA on its own, so it needs whichever key is in use.
export async function syncNimKeyToNative(): Promise<NimKeySource> {
  const { key, source } = await getActiveNimKey();
  if (Platform.OS === "android" && NativeModules.NotificationModule?.storeNimKey) {
    NativeModules.NotificationModule.storeNimKey(key ?? "");
  }
  return source;
}

export async function getInstalledApps(packages: string[]): Promise<InstalledApp[]> {
  if (Platform.OS !== "android" || !NativeModules.NotificationModule?.getInstalledApps) {
    return [];
  }
  try {
    const apps: InstalledApp[] = await NativeModules.NotificationModule.getInstalledApps(packages);
    return [...apps].sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}
