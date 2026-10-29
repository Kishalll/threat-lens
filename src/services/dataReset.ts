import { NativeModules, Platform } from "react-native";

import { useBreachStore } from "../stores/breachStore";
import { useDashboardStore } from "../stores/dashboardStore";
import { useScannerStore } from "../stores/scannerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { log } from "../utils/activityLog";
import { DEFAULT_SETTINGS } from "../utils/settings";
import { syncBreachCheckTask } from "./backgroundTasks";
import { syncNimKeyToNative, syncScannerSettingsToNative } from "./nativeSettings";
import { PROTECTED_EXPORT_DIR_URI_KEY, removeUserNimKey, setKey } from "./secureKeyService";
import { clearAllTables } from "./storageService";

// Wipes everything the user has saved, but keeps the device identity (install
// ID, signing key, master cert) so the app does not register as a new device.
export async function clearAllAppData(): Promise<void> {
  await clearAllTables();
  await removeUserNimKey();
  await setKey(PROTECTED_EXPORT_DIR_URI_KEY, "");

  // Scans the killed-app worker saved but the app has not picked up yet.
  if (Platform.OS === "android" && NativeModules.NotificationModule?.consumePendingScans) {
    await NativeModules.NotificationModule.consumePendingScans().catch(() => {});
  }

  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  useScannerStore.setState({ history: [] });
  useBreachStore.setState({ credentials: [], breaches: [], lastScanTimestamp: 0, scanError: null });

  const dashboard = useDashboardStore.getState();
  await dashboard.hydrateScanHistory([]);
  dashboard.updateDashboardData({ activeBreachesCount: 0 });
  dashboard.pruneSuggestionsForSource("breach", []);

  syncScannerSettingsToNative(DEFAULT_SETTINGS.scanner);
  await syncNimKeyToNative();
  await syncBreachCheckTask(DEFAULT_SETTINGS.breach);

  log("data_cleared", "All app data cleared");
}
