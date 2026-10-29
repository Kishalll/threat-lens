import React, { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { THEME } from "../constants/theme";
import { unlock } from "../services/appLock";
import { useSettingsStore } from "../stores/settingsStore";

// Short trips out of the app (pickers, the unlock prompt itself) don't relock.
const RELOCK_AFTER_MS = 30_000;

export default function AppLockGate({ children }: { children: React.ReactNode }) {
  const hydrated = useSettingsStore((state) => state.hydrated);
  const appLock = useSettingsStore((state) => state.settings.general.appLock);
  const [locked, setLocked] = useState(false);
  const decidedOnLaunch = useRef(false);
  const hiddenAt = useRef<number | null>(null);
  const prompting = useRef(false);

  // Lock once on launch, as soon as the saved settings are known.
  useEffect(() => {
    if (hydrated && !decidedOnLaunch.current) {
      decidedOnLaunch.current = true;
      if (appLock) setLocked(true);
    }
  }, [hydrated, appLock]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      // The PIN screen can briefly send the app to the background; ignore that.
      if (prompting.current) return;
      if (state === "background") {
        hiddenAt.current = Date.now();
        return;
      }
      if (state === "active") {
        const awayFor = hiddenAt.current === null ? 0 : Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        if (awayFor > RELOCK_AFTER_MS && useSettingsStore.getState().settings.general.appLock) {
          setLocked(true);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const tryUnlock = async () => {
    if (prompting.current) return;
    prompting.current = true;
    const ok = await unlock("Unlock ThreatLens");
    prompting.current = false;
    if (ok) setLocked(false);
  };

  useEffect(() => {
    if (locked) void tryUnlock();
  }, [locked]);

  return (
    <View style={styles.root}>
      {children}
      {/* Until settings load we don't know whether to lock, so cover the app
          for that moment rather than flash its content. */}
      {!hydrated || locked ? (
        <View style={[StyleSheet.absoluteFill, styles.cover]}>
          {locked ? (
            <View style={styles.lockBody}>
              <View style={styles.iconWrap}>
                <Feather name="lock" size={28} color={THEME.colors.accent} />
              </View>
              <Text style={styles.title}>ThreatLens is locked</Text>
              <Text style={styles.subtitle}>Unlock with your fingerprint, face or phone PIN.</Text>
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                onPress={() => void tryUnlock()}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Unlock</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  cover: {
    backgroundColor: THEME.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  lockBody: {
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: THEME.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${THEME.colors.accent}22`,
    marginBottom: 8,
  },
  title: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.h1,
    fontWeight: "700",
  },
  subtitle: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
    textAlign: "center",
  },
  button: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.accent,
  },
  buttonText: {
    color: "#0A0F14",
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.7,
  },
});
