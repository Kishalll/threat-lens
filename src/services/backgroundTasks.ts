import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { useBreachStore } from "../stores/breachStore";
import { useDashboardStore } from "../stores/dashboardStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { AppSettings } from "../utils/settings";
import { sendLocalNotification } from "./notificationService";
import { executeBreachScan } from "./breachDomainService";
import { replaceCachedBreaches } from "./storageService";
import { log } from "../utils/activityLog";
import { breachAlertText } from "../utils/alertText";

const BREACH_CHECK_TASK = "BACKGROUND_BREACH_CHECK";

TaskManager.defineTask(BREACH_CHECK_TASK, async () => {
  try {
    // When Android runs this with the app closed, nothing has loaded the stores yet.
    if (!useSettingsStore.getState().hydrated) {
      await useSettingsStore.getState().hydrate();
    }
    if (!useBreachStore.getState().isHydrated) {
      await useBreachStore.getState().hydrateFromStorage();
    }

    const credentials = useBreachStore.getState().credentials;
    if (credentials.length === 0) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    log("breach_check", `checking ${credentials.length} credentials...`);

    const outcome = await executeBreachScan({
      credentials,
      previousBreaches: useBreachStore.getState().breaches,
    });

    await replaceCachedBreaches(outcome.breaches);
    useBreachStore.setState({ breaches: outcome.breaches, lastScanTimestamp: Date.now() });
    useDashboardStore.getState().updateDashboardData({
      activeBreachesCount: outcome.activeBreachesCount,
    });
    useDashboardStore
      .getState()
      .pruneSuggestionsForSource("breach", outcome.breaches.map((breach) => breach.id));

    if (outcome.alertPayload) {
      log("breach_found", `${outcome.alertPayload.count} new breach(es) found`);
      if (!useSettingsStore.getState().settings.breach.alerts) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }

      const alert = breachAlertText(outcome.alertPayload.count, outcome.alertPayload.credentialSummary);
      await sendLocalNotification(
        alert.title,
        alert.body,
        {
          type: "BREACH_ALERT",
          breachIds: outcome.alertPayload.breachIds,
          credentials: outcome.alertPayload.credentials,
          threatlensInternal: true,
        }
      );
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error("Background fetch failed", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Registering restarts Android's timer for the task, so only touch it when the
// saved setting differs from what is already registered.
export async function syncBreachCheckTask(settings: AppSettings["breach"]): Promise<void> {
  try {
    const tasks = await TaskManager.getRegisteredTasksAsync();
    const current = tasks.find((task) => task.taskName === BREACH_CHECK_TASK);
    const minimumInterval = settings.intervalHours * 60;

    if (!settings.backgroundChecks) {
      if (current) {
        await BackgroundTask.unregisterTaskAsync(BREACH_CHECK_TASK);
      }
      log("breach_check", "background check off");
      return;
    }

    const currentInterval = (current?.options as { minimumInterval?: number } | undefined)?.minimumInterval;
    if (currentInterval !== minimumInterval) {
      if (current) {
        await BackgroundTask.unregisterTaskAsync(BREACH_CHECK_TASK);
      }
      await BackgroundTask.registerTaskAsync(BREACH_CHECK_TASK, { minimumInterval });
    }
    log("breach_check", `background check every ${settings.intervalHours}h`);
  } catch (err) {
    console.error("Breach check task sync failed:", err);
  }
}
