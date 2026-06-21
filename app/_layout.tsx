import { DMSans_400Regular } from "@expo-google-fonts/dm-sans";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { Alert, AppState, LogBox, NativeModules, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initDatabase, insertScanResult } from "../src/services/storageService";
import { registerBackgroundFetchTasks } from "../src/services/backgroundTasks";
import {
  getInitialSharedText,
  initializeNotificationInterceptor,
  isNotificationAccessGranted,
  notificationEmitter,
  openNotificationAccessSettings,
} from "../src/modules/notificationBridge";
import { requestNotificationPermissions, setupNotificationChannel } from "../src/services/notificationService";
import { getKey } from "../src/services/secureKeyService";
import { useBreachStore } from "../src/stores/breachStore";
import { useScannerStore } from "../src/stores/scannerStore";
import { THEME } from "../src/constants/theme";
import type { ScanResult } from "../src/types";
import { log } from "../src/utils/activityLog";

const DEBUG = false;

export default function RootLayout() {
  if (__DEV__) {
    LogBox.ignoreLogs(["Unable to activate keep awake"]);
  }

  const [fontsLoaded] = useFonts({
    "DMSans-Regular": DMSans_400Regular,
    "JetBrainsMono-Regular": JetBrainsMono_400Regular,
  });

  const router = useRouter();

  const persistRecoveredScan = async (result: ScanResult): Promise<void> => {
    if (!result?.id) {
      return;
    }

    try {
      await insertScanResult(result);
    } catch {
      // Recovery should continue even if local persistence fails for one item.
    }
  };

  const syncNativeAppActiveState = (isActive: boolean): void => {
    if (Platform.OS !== "android" || !NativeModules.NotificationModule?.setAppActive) {
      return;
    }

    NativeModules.NotificationModule.setAppActive(isActive);
  };

  useEffect(() => {
    log("app_open", "App launched");

    // One-time setup — must not re-run when router changes
    initializeNotificationInterceptor();
    void requestNotificationPermissions();
    void setupNotificationChannel();
    void registerBackgroundFetchTasks();

    void (async () => {
      try {
        // Store NIM key in SharedPreferences so Kotlin worker can use it in killed state
        const nimKey = await getKey("NIM_API_KEY");
        if (nimKey && Platform.OS === "android" && NativeModules.NotificationModule?.storeNimKey) {
          NativeModules.NotificationModule.storeNimKey(nimKey);
          log("nim_key_stored", "Sent API key to background worker");
        }
        syncNativeAppActiveState(AppState.currentState === "active");

        await initDatabase();

        // Load any scan results persisted by the Kotlin worker while the app was killed
        try {
          if (Platform.OS === "android" && NativeModules.NotificationModule?.consumePendingScans) {
            const raw = await NativeModules.NotificationModule.consumePendingScans();
            const parsed: ScanResult[] = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              log("pending_scans_loaded", `Loaded ${parsed.length} missed scans`);
              const store = useScannerStore.getState();
              const existingIds = new Set(store.history.map((r) => r.id));
              for (const result of parsed) {
                if (result?.id && !existingIds.has(result.id)) {
                  await persistRecoveredScan(result);
                  store.recordBackgroundScan(result);
                  existingIds.add(result.id);
                }
              }
            }
          }
        } catch {
          // Missing or malformed pending scan payload should not block app startup.
        }
        const breachStore = useBreachStore.getState();
        await breachStore.hydrateFromStorage();
        const hydratedState = useBreachStore.getState();
        if (hydratedState.credentials.length > 0) {
          await hydratedState.runScan({ notifyOnNew: true });
        }
      } catch (error: unknown) {
        if (DEBUG) console.error("Root init failed", error);
      }
    })();
  }, []);

  useEffect(() => {
    syncNativeAppActiveState(AppState.currentState === "active");

    const subscription = AppState.addEventListener("change", (nextState) => {
      syncNativeAppActiveState(nextState === "active");
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const checkNotificationAccess = async () => {
      if (Platform.OS !== "android") return;
      const granted = await isNotificationAccessGranted();
      if (granted) return;
      Alert.alert(
        "Enable Notification Access",
        "ThreatLens needs Notification Access to scan incoming notifications automatically.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => openNotificationAccessSettings() },
        ]
      );
    };
    void checkNotificationAccess();

    const handleSharedText = async (text: string) => {
      const normalizedText = text.trim();
      if (!normalizedText) return;
      router.push({ pathname: "/scanner", params: { prefill: normalizedText } });
    };

    const sharedTextSubscription = notificationEmitter?.addListener(
      "SharedTextReceived",
      (event: { text?: unknown }) => {
        const text = typeof event?.text === "string" ? event.text : "";
        if (text.trim().length > 0) void handleSharedText(text);
      }
    );

    void getInitialSharedText().then((sharedText) => {
      if (sharedText) void handleSharedText(sharedText);
    });

    const handleUrl = async (url: string | null) => {
      if (url) {
        try {
          const parsed = Linking.parse(url);
          const fullPath = [parsed.hostname, parsed.path].filter(Boolean).join('/');

          if (fullPath === 'scan/result' && parsed.queryParams?.data) {
            const encodedResult = parsed.queryParams.data as string;
            try {
              const result = JSON.parse(decodeURIComponent(escape(atob(encodedResult)))) as ScanResult;
              await persistRecoveredScan(result);
              useScannerStore.getState().recordBackgroundScan(result);
            } catch {}
            router.replace({ pathname: '/scan/result', params: { encodedResult } });
            return;
          }

          // Paste prompt tap: threatlens://scanner?prefill=<text>
          if (parsed.hostname === 'scanner' && parsed.queryParams?.prefill) {
            const prefill = parsed.queryParams.prefill as string;
            router.push({ pathname: '/(tabs)/scanner', params: { prefill } });
            return;
          }

          if (parsed.hostname === 'breach') {
            const breachId = parsed.path;
            if (breachId) {
              router.push({ pathname: '/breach/[id]', params: { id: breachId } });
            } else {
              router.push('/(tabs)/breach');
            }
            return;
          }

          const textAttr =
            parsed.queryParams?.text ||
            parsed.queryParams?.["android.intent.extra.TEXT"];
          if (textAttr && typeof textAttr === "string") void handleSharedText(textAttr);
        } catch (e) {}
      }
    };

    Linking.getInitialURL().then((url) => {
      setTimeout(() => {
        void handleUrl(url);
      }, 300);
    });
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      linkingSubscription.remove();
      sharedTextSubscription?.remove();
    };
  }, [router]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: styles.stackContent,
          }}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  stackContent: {
    backgroundColor: THEME.colors.background,
  },
});
