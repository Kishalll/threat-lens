import { DMSans_400Regular } from "@expo-google-fonts/dm-sans";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
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
import { requestNotificationPermissions, setupNotificationChannel } from "../src/services/notificationService";
import { useBreachStore } from "../src/stores/breachStore";
import { useScannerStore } from "../src/stores/scannerStore";
import { THEME } from "../src/constants/theme";
import type { ScanResult } from "../src/types";

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
    // One-time setup — must not re-run when router changes
    initializeNotificationInterceptor();
    void requestNotificationPermissions();
    void setupNotificationChannel();
    void registerBackgroundFetchTasks();

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
        if (DEBUG) console.error("Root initDatabase failed", error);
      }
    })();
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

    const handleUrl = (url: string | null) => {
      if (url) {
        try {
          const parsed = Linking.parse(url);
          const fullPath = [parsed.hostname, parsed.path].filter(Boolean).join('/');

          if (fullPath === 'scan/result' && parsed.queryParams?.data) {
            const encodedResult = parsed.queryParams.data as string;
            try {
              const result = JSON.parse(decodeURIComponent(escape(atob(encodedResult)))) as ScanResult;
              useScannerStore.getState().recordBackgroundScan(result);
            } catch {}
            router.replace({ pathname: '/scan/result', params: { encodedResult } });
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
      setTimeout(() => handleUrl(url), 300);
    });
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));

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