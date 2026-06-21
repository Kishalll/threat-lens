import { DMSans_400Regular } from "@expo-google-fonts/dm-sans";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { Alert, AppState, LogBox, NativeModules, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { parseThreatLensUrl } from "../src/services/deepLinkService";
import { initDatabase } from "../src/services/storageService";
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
        const scannerStore = useScannerStore.getState();
        await scannerStore.hydrateFromStorage();

        // Load any scan results persisted by the Kotlin worker while the app was killed
        try {
          if (Platform.OS === "android" && NativeModules.NotificationModule?.consumePendingScans) {
            const raw = await NativeModules.NotificationModule.consumePendingScans();
            const parsed: ScanResult[] = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              log("pending_scans_loaded", `Loaded ${parsed.length} missed scans`);
              const existingIds = new Set(scannerStore.history.map((r) => r.id));
              for (const result of parsed) {
                if (result?.id && !existingIds.has(result.id)) {
                  await scannerStore.recordBackgroundScan(result);
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
      const route = parseThreatLensUrl(url);
      if (!route) {
        return;
      }

      if (route.type === "scan-result") {
        try {
          const result = JSON.parse(
            decodeURIComponent(escape(atob(route.encodedResult)))
          ) as ScanResult;
          await useScannerStore.getState().recordBackgroundScan(result);
        } catch {
          // Routing should continue even if result recovery fails.
        }
        router.replace({
          pathname: "/scan/result",
          params: { encodedResult: route.encodedResult, source: route.source },
        });
        return;
      }

      if (route.type === "scanner-prefill") {
        router.push({ pathname: "/(tabs)/scanner", params: { prefill: route.prefill } });
        return;
      }

      if (route.type === "breach-detail") {
        router.push({ pathname: "/breach/[id]", params: { id: route.breachId } });
        return;
      }

      if (route.type === "breach-list") {
        router.push("/(tabs)/breach");
        return;
      }

      if (route.type === "shared-text") {
        void handleSharedText(route.text);
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
