import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { useBreachStore } from "../stores/breachStore";
import { sendLocalNotification } from "./notificationService";
import { checkAllCredentials } from "./breachApiService";

const BREACH_CHECK_TASK = "BACKGROUND_BREACH_CHECK";

function summarizeCredentials(values: string[]): string {
  const uniqueValues = Array.from(new Set(values.filter((value) => value.trim().length > 0)));
  if (uniqueValues.length === 0) {
    return "your monitored accounts";
  }
  if (uniqueValues.length === 1) {
    return uniqueValues[0];
  }
  if (uniqueValues.length === 2) {
    return `${uniqueValues[0]} and ${uniqueValues[1]}`;
  }
  return `${uniqueValues[0]}, ${uniqueValues[1]}, and ${uniqueValues.length - 2} more`;
}

TaskManager.defineTask(BREACH_CHECK_TASK, async () => {
  try {
    const credentials = useBreachStore.getState().credentials;
    if (credentials.length === 0) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const itemsToCheck = credentials.map(c => c.value);
    
    // Remember previous breach IDs to detect new ones
    const previousBreaches = useBreachStore.getState().breaches;
    const prevIds = new Set(previousBreaches.map(b => b.id));
    const previousById = new Map(previousBreaches.map((breach) => [breach.id, breach]));

    const results = await checkAllCredentials(itemsToCheck);
    const mergedResults = results.map((breach) => {
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
    
    // Update state
    useBreachStore.setState({ breaches: mergedResults, lastScanTimestamp: Date.now() });

    // Check for NEW breaches
    const newBreaches = mergedResults.filter(b => !prevIds.has(b.id));

    if (newBreaches.length > 0) {
      const credentialSummary = summarizeCredentials(
        newBreaches
          .map((breach) => breach.matchedCredential)
          .filter((value): value is string => typeof value === "string")
      );

      // Fire local notification
      await sendLocalNotification(
        "New Data Breach Detected",
        `${newBreaches.length} new breach(es) found for ${credentialSummary}. Tap to review.`,
        {
          type: "BREACH_ALERT",
          breachIds: newBreaches.map(b => b.id),
          credentials: newBreaches
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
