import { DMSans_400Regular } from "@expo-google-fonts/dm-sans";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Alert, LogBox, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initDatabase } from "../src/services/storageService";
import { registerBackgroundFetchTasks } from "../src/services/backgroundTasks";
import {
  getInitialSharedText,
  initializeNotificationInterceptor,
  isNotificationAccessGranted,
  notificationEmitter,
  openNotificationAccessSettings,
} from "../src/modules/notificationBridge";
import { requestNotificationPermissions } from "../src/services/notificationService";
import { useBreachStore } from "../src/stores/breachStore";
import { THEME } from "../src/constants/theme";

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

  useEffect(() => {
    // Initialize here — inside useEffect — so the native bridge is fully ready.
    initializeNotificationInterceptor();
    const handleNotificationTap = async (
      response: Notifications.NotificationResponse | null
    ) => {
      if (!response) {
        return;
      }

      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (!data || typeof data.type !== "string") {
        return;
      }

      if (data.type === "PASTE_FULL_NOTIFICATION_PROMPT") {
        const capturedText = typeof data.capturedText === "string" ? data.capturedText : "";
        router.push({ pathname: "/scanner", params: capturedText ? { prefill: capturedText } : undefined });
        return;
      }

      if (data.type === "SCAN_RETRY_PROMPT") {
        const sourceText = typeof data.sourceText === "string" ? data.sourceText : "";
        router.push({ pathname: "/scanner", params: sourceText.trim() ? { prefill: sourceText } : undefined });
        return;
      }

      if (data.type === "BREACH_ALERT") {
        router.push("/(tabs)/breach");
        return;
      }

      if (data.type !== "THREAT_ALERT" && data.type !== "PROMO_ALERT") {
        return;
      }

      const scanId = typeof data.scanId === "string" ? data.scanId : "";
      if (scanId) {
        router.push({ pathname: "/scan/result", params: { id: scanId } });
        return;
      }

      const sourceText = typeof data.sourceText === "string" ? data.sourceText : "";
      if (!sourceText.trim()) {
        router.push("/scanner");
        return;
      }

      router.push({ pathname: "/scanner", params: { prefill: sourceText } });
    };

    const checkNotificationAccess = async () => {
      if (Platform.OS !== "android") {
        return;
      }

      const granted = await isNotificationAccessGranted();
      if (granted) {
        return;
      }

      Alert.alert(
        "Enable Notification Access",
        "ThreatLens needs Notification Access to scan incoming notifications automatically.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => openNotificationAccessSettings() },
        ]
      );
    };

    // 🔥 1. Ask notification permission
    void requestNotificationPermissions();

    // 🔥 2. Background tasks
    void registerBackgroundFetchTasks();

    // 🔥 3. Notification tap actions
    const notificationResponseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        void handleNotificationTap(response);
      });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      void handleNotificationTap(response);
    });

    void checkNotificationAccess();

    const sharedTextSubscription = notificationEmitter?.addListener(
      "SharedTextReceived",
      (event: { text?: unknown }) => {
        const text = typeof event?.text === "string" ? event.text : "";
        if (text.trim().length > 0) {
          void handleSharedText(text);
        }
      }
    );

    void getInitialSharedText().then((sharedText) => {
      if (sharedText) {
        void handleSharedText(sharedText);
      }
    });

    // 🔗 Deep link handler (your existing logic)
    const handleSharedText = async (text: string) => {
      const normalizedText = text.trim();
      if (!normalizedText) {
        return;
      }

      router.push({ pathname: "/scanner", params: { prefill: normalizedText } });
    };

    const handleUrl = (url: string | null) => {
      if (url) {
        try {
          const parsed = Linking.parse(url);
          const textAttr =
            parsed.queryParams?.text ||
            parsed.queryParams?.["android.intent.extra.TEXT"];

          if (textAttr && typeof textAttr === "string") {
            void handleSharedText(textAttr);
          }
        } catch (e) {}
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const linkingSubscription = Linking.addEventListener("url", ({ url }) =>
      handleUrl(url)
    );

    // 🗄️ Init DB + hydrate persisted data
    void (async () => {
      try {
        await initDatabase();

        const breachStore = useBreachStore.getState();
        await breachStore.hydrateFromStorage();

        const hydratedState = useBreachStore.getState();
        if (hydratedState.credentials.length > 0) {
          await hydratedState.runScan({ notifyOnNew: true });
        }
      } catch (error: unknown) {
        const typedError =
          error instanceof Error
            ? error
            : new Error("Database initialization failed");

        if (DEBUG) console.error("Root initDatabase failed", typedError);
      }
    })();

    // 🧹 CLEANUP
    return () => {
      linkingSubscription.remove();
      notificationResponseSubscription.remove();
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