import { NativeModules, Platform } from "react-native";
import type { AppSettings } from "../utils/settings";

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
