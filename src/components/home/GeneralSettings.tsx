import React, { useEffect, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from "react-native";

import { THEME } from "../../constants/theme";
import { makeStyles, useTheme } from "../../hooks/useTheme";
import { canUseAppLock, unlock } from "../../services/appLock";
import { clearAllAppData } from "../../services/dataReset";
import { testNimKey } from "../../services/nimService";
import { syncNimKeyToNative } from "../../services/nativeSettings";
import { getActiveNimKey, removeUserNimKey, saveUserNimKey } from "../../services/secureKeyService";
import { useSettingsStore } from "../../stores/settingsStore";
import { log } from "../../utils/activityLog";
import { maskNimKey, type NimKeySource } from "../../utils/nimKey";
import ConfirmDialog, { type ConfirmRequest } from "../settings/ConfirmDialog";
import { OptionPicker, SettingsNote, SettingsRow, SettingsSection, SettingsSwitch } from "../settings/SettingsControls";
import type { ThemePreference } from "../../utils/settings";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

type Status = { tone: "ok" | "error" | "warn"; text: string } | null;

const SOURCE_LABEL: Record<NimKeySource, string> = {
  yours: "Your key",
  "built-in": "Built-in key",
  none: "None",
};

export default function GeneralSettings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [source, setSource] = useState<NimKeySource | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [cleared, setCleared] = useState(false);
  const appLock = useSettingsStore((state) => state.settings.general.appLock);
  const themePreference = useSettingsStore((state) => state.settings.general.theme);
  const updateSettings = useSettingsStore((state) => state.update);
  const [lockError, setLockError] = useState<string | null>(null);

  const refresh = async () => {
    const active = await getActiveNimKey();
    setSource(active.source);
    setSavedKey(active.source === "yours" ? active.key : null);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const runTest = async (key: string): Promise<boolean> => {
    Keyboard.dismiss();
    setBusy(true);
    setStatus(null);
    const result = await testNimKey(key);
    setBusy(false);
    if (result === "works") {
      setStatus({ tone: "ok", text: "Key works." });
      return true;
    }
    setStatus(
      result === "rejected"
        ? { tone: "error", text: "NVIDIA rejected this key. Check that you copied all of it." }
        : { tone: "warn", text: "Couldn't reach NVIDIA to check the key. Try again in a moment." }
    );
    return false;
  };

  const save = async () => {
    const key = draft.trim();
    if (!key) {
      setStatus({ tone: "error", text: "Paste your key first. It starts with nvapi-." });
      return;
    }
    if (!(await runTest(key))) return;
    await saveUserNimKey(key);
    const next = await syncNimKeyToNative();
    log("nim_key_stored", `Sent ${next} API key to background worker`);
    setDraft("");
    await refresh();
    setStatus({ tone: "ok", text: "Saved. Every scan now uses your key." });
  };

  const remove = () => {
    setConfirm({
      title: "Remove your key?",
      message: "Scans go back to the key built into the app.",
      confirmLabel: "Remove",
      onConfirm: async () => {
        await removeUserNimKey();
        const next = await syncNimKeyToNative();
        log("nim_key_stored", `Sent ${next} API key to background worker`);
        await refresh();
        setStatus({ tone: "ok", text: "Removed. Scans use the built-in key again." });
      },
    });
  };

  // Both turning the lock on and off ask for an unlock first: on, so a broken
  // setup can't lock you out; off, so someone holding your phone can't skip it.
  const setAppLock = async (value: boolean) => {
    setLockError(null);
    if (value && !(await canUseAppLock())) {
      setLockError("Set up a screen lock on your phone first.");
      return;
    }
    if (!(await unlock(value ? "Turn on app lock" : "Turn off app lock"))) {
      return;
    }
    await updateSettings("general", { appLock: value });
  };

  const clearAll = () => {
    setConfirm({
      title: "Clear all data?",
      message:
        "This deletes your scan history, monitored accounts and breach results, all settings and your NVIDIA key. " +
        "Your device identity and images you already saved stay. This can't be undone.",
      confirmLabel: "Clear all",
      onConfirm: async () => {
        await clearAllAppData();
        setStatus(null);
        setDraft("");
        await refresh();
        setCleared(true);
      },
    });
  };

  const statusColor =
    status?.tone === "ok" ? colors.accent : status?.tone === "warn" ? colors.warning : colors.danger;
  const sourceColor = source === "yours" ? colors.accent : source === "none" ? colors.danger : colors.textSecondary;

  return (
    <>
      <SettingsSection title="NVIDIA API key">
        <SettingsRow
          first
          label="Key in use"
          right={
            source === null ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={[styles.source, { color: sourceColor }]}>{SOURCE_LABEL[source]}</Text>
            )
          }
        />
        <View style={styles.keyBody}>
          {savedKey ? (
            <Text style={styles.masked}>{maskNimKey(savedKey)}</Text>
          ) : (
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="nvapi-..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="NVIDIA API key"
            />
          )}
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.pressed, busy && styles.disabled]}
              onPress={() => void runTest(savedKey ?? draft)}
              disabled={busy || (!savedKey && !draft.trim())}
            >
              <Text style={styles.buttonText}>Test</Text>
            </Pressable>
            {savedKey ? (
              <Pressable
                style={({ pressed }) => [styles.button, styles.dangerButton, pressed && styles.pressed]}
                onPress={remove}
                disabled={busy}
              >
                <Text style={[styles.buttonText, { color: colors.danger }]}>Remove</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}
                onPress={() => void save()}
                disabled={busy}
              >
                <Text style={[styles.buttonText, styles.primaryText]}>Save</Text>
              </Pressable>
            )}
          </View>
          {busy ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.statusText}>Checking with NVIDIA...</Text>
            </View>
          ) : status ? (
            <Text style={[styles.statusText, { color: statusColor }]}>{status.text}</Text>
          ) : null}
        </View>
      </SettingsSection>
      <SettingsNote>Saved on this phone only. Used for every scan, even when the app is closed.</SettingsNote>

      <SettingsSection title="Appearance">
        <View style={styles.keyBody}>
          <OptionPicker
            options={THEME_OPTIONS}
            value={themePreference}
            onChange={(theme) => void updateSettings("general", { theme })}
          />
          <SettingsNote>System follows your phone's light or dark setting.</SettingsNote>
        </View>
      </SettingsSection>

      <SettingsSection title="Security">
        <SettingsSwitch
          first
          label="App lock"
          description="Ask for fingerprint, face or PIN when you open the app or come back after 30 seconds"
          value={appLock}
          onValueChange={(value) => void setAppLock(value)}
        />
        {lockError ? (
          <View style={styles.lockError}>
            <Text style={[styles.statusText, { color: colors.danger }]}>{lockError}</Text>
          </View>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Data">
        <View style={styles.keyBody}>
          <Pressable
            style={({ pressed }) => [styles.button, styles.dangerButton, pressed && styles.pressed]}
            onPress={clearAll}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: colors.danger }]}>Clear all data</Text>
          </Pressable>
          {cleared ? <Text style={[styles.statusText, { color: colors.accent }]}>All data cleared.</Text> : null}
        </View>
      </SettingsSection>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  source: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    fontWeight: "700",
  },
  keyBody: {
    padding: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 13,
  },
  masked: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dangerButton: {
    borderColor: colors.danger,
  },
  buttonText: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    fontWeight: "700",
  },
  primaryText: {
    color: colors.onAccent,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.caption,
  },
  lockError: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
}));
