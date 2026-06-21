import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { useBreachStore } from "../stores/breachStore";
import { useDashboardStore } from "../stores/dashboardStore";
import { sendLocalNotification } from "./notificationService";
import { checkAllCredentials } from "./breachApiService";
import {
  countActiveBreaches,
  formatCredentialSummary,
  mergeBreachScanResults,
} from "./breachPipeline";
import { replaceCachedBreaches } from "./storageService";
import { log } from "../utils/activityLog";

const BREACH_CHECK_TASK = "BACKGROUND_BREACH_CHECK";

TaskManager.defineTask(BREACH_CHECK_TASK, async () => {
  try {
    const credentials = useBreachStore.getState().credentials;
    if (credentials.length === 0) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    log("breach_check", `checking ${credentials.length} credentials...`);

    const itemsToCheck = credentials.map((credential) => credential.value);
    const previousBreaches = useBreachStore.getState().breaches;
    const results = await checkAllCredentials(itemsToCheck);
    const outcome = mergeBreachScanResults(previousBreaches, results, itemsToCheck);

    await replaceCachedBreaches(outcome.breaches);
    useBreachStore.setState({ breaches: outcome.breaches, lastScanTimestamp: Date.now() });
    useDashboardStore.getState().updateDashboardData({
      activeBreachesCount: countActiveBreaches(outcome.breaches),
    });
    useDashboardStore
      .getState()
      .pruneSuggestionsForSource("breach", outcome.breaches.map((breach) => breach.id));

    if (outcome.newBreaches.length > 0) {
      const credentialSummary = formatCredentialSummary(outcome.newBreaches);

      log("breach_found", `${outcome.newBreaches.length} new breach(es) found`);

      await sendLocalNotification(
        "New Data Breach Detected",
        `${outcome.newBreaches.length} new breach(es) found for ${credentialSummary}. Tap to review.`,
        {
          type: "BREACH_ALERT",
          breachIds: outcome.newBreaches.map((breach) => breach.id),
          credentials: outcome.newBreaches
            .map((breach) => breach.matchedCredential)
            .filter((value): value is string => typeof value === "string"),
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

export async function registerBackgroundFetchTasks() {
  try {
    await BackgroundTask.registerTaskAsync(BREACH_CHECK_TASK, {
      minimumInterval: 60, // 1 hour (in minutes)
    });
    console.log("Registered breach check background task");
  } catch (err) {
    console.error("Task Register failed:", err);
  }
}
