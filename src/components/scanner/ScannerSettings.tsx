import React, { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { THEME } from "../../constants/theme";
import { getInstalledApps, syncScannerSettingsToNative, type InstalledApp } from "../../services/nativeSettings";
import { useScannerStore } from "../../stores/scannerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ALLOWED_MESSAGING_PACKAGES } from "../../utils/notificationFilters";
import {
  CUSTOM_RETENTION_LIMITS,
  retentionCutoff,
  retentionLabel,
  type AppSettings,
  type RetentionMode,
  type RetentionUnit,
} from "../../utils/settings";
import ConfirmDialog, { type ConfirmRequest } from "../settings/ConfirmDialog";
import {
  OptionPicker,
  SettingsNote,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "../settings/SettingsControls";

type Retention = AppSettings["scanner"]["retention"];

const MODE_OPTIONS: { value: RetentionMode; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "custom", label: "Custom" },
  { value: "forever", label: "Forever" },
];

const UNIT_OPTIONS: { value: RetentionUnit; label: string }[] = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

export default function ScannerSettings() {
  const scanner = useSettingsStore((state) => state.settings.scanner);
  const update = useSettingsStore((state) => state.update);
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const history = useScannerStore((state) => state.history);
  const [customDraft, setCustomDraft] = useState(String(scanner.retention.customValue));
  const [customError, setCustomError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    let active = true;
    void getInstalledApps([...ALLOWED_MESSAGING_PACKAGES]).then((list) => {
      if (active) setApps(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const change = async (patch: Partial<AppSettings["scanner"]>) => {
    await update("scanner", patch);
    syncScannerSettingsToNative(useSettingsStore.getState().settings.scanner);
  };

  const setAppEnabled = (packageName: string, enabled: boolean) => {
    const others = scanner.disabledApps.filter((name) => name !== packageName);
    void change({ disabledApps: enabled ? others : [...others, packageName] });
  };

  const applyRetention = async (retention: Retention) => {
    await change({ retention });
    await useScannerStore.getState().applyRetention();
  };

  // Ask first when a shorter setting would delete scans that are already saved.
  const setRetention = (retention: Retention) => {
    const cutoff = retentionCutoff(retention, Date.now());
    const doomed = cutoff === null ? 0 : history.filter((scan) => scan.timestamp < cutoff).length;
    if (doomed === 0) {
      void applyRetention(retention);
      return;
    }
    setConfirm({
      title: "Delete old scans?",
      message: `This deletes ${doomed} ${doomed === 1 ? "scan" : "scans"} older than ${retentionLabel(retention)}.`,
      confirmLabel: "Delete",
      onConfirm: () => void applyRetention(retention),
    });
  };

  const saveCustom = (unit: RetentionUnit) => {
    Keyboard.dismiss();
    const value = Number(customDraft);
    const limit = CUSTOM_RETENTION_LIMITS[unit];
    if (!Number.isInteger(value) || value < 1 || value > limit) {
      setCustomError(`Enter a whole number from 1 to ${limit} ${unit}.`);
      return;
    }
    setCustomError(null);
    setRetention({ mode: "custom", customValue: value, customUnit: unit });
  };

  const clearHistory = () => {
    setConfirm({
      title: "Clear scan history?",
      message: history.length === 1
        ? "Delete your saved scan? This can't be undone."
        : `Delete all ${history.length} saved scans? This can't be undone.`,
      confirmLabel: "Clear",
      onConfirm: () => void useScannerStore.getState().clearHistory(),
    });
  };

  const scanningOff = !scanner.interceptionEnabled;
  const { retention } = scanner;

  return (
    <>
      <SettingsSection>
        <SettingsSwitch
          first
          label="Scan incoming notifications"
          description="Also works when the app is closed"
          value={scanner.interceptionEnabled}
          onValueChange={(value) => void change({ interceptionEnabled: value })}
        />
      </SettingsSection>

      <SettingsSection title="Apps">
        {apps === null ? (
          <SettingsRow first label="Loading apps..." />
        ) : apps.length === 0 ? (
          <SettingsRow first label="No supported apps found" />
        ) : (
          apps.map((app, index) => (
            <SettingsSwitch
              key={app.packageName}
              first={index === 0}
              label={app.label}
              value={!scanner.disabledApps.includes(app.packageName)}
              onValueChange={(value) => setAppEnabled(app.packageName, value)}
              disabled={scanningOff}
            />
          ))
        )}
      </SettingsSection>
      <SettingsNote>Only supported apps installed on this phone are listed.</SettingsNote>

      <SettingsSection>
        <SettingsSwitch
          first
          label="Promo alerts"
          description="Notify me when a message is promotional"
          value={scanner.promoAlerts}
          onValueChange={(value) => void change({ promoAlerts: value })}
          disabled={scanningOff}
        />
        <SettingsSwitch
          label="Ask me to paste cut-off messages"
          description="When an app shows only part of a message"
          value={scanner.pastePrompts}
          onValueChange={(value) => void change({ pastePrompts: value })}
          disabled={scanningOff}
        />
      </SettingsSection>

      <SettingsSection title="Keep history">
        <View style={styles.historyBody}>
          <OptionPicker
            options={MODE_OPTIONS}
            value={retention.mode}
            onChange={(mode) => setRetention({ ...retention, mode })}
          />
          {retention.mode === "custom" ? (
            <View style={styles.customRow}>
              <TextInput
                style={styles.customInput}
                value={customDraft}
                onChangeText={(text) => setCustomDraft(text.replace(/[^0-9]/g, ""))}
                onEndEditing={() => saveCustom(retention.customUnit)}
                keyboardType="number-pad"
                maxLength={3}
                accessibilityLabel="Keep history for"
              />
              <View style={styles.unitPicker}>
                <OptionPicker options={UNIT_OPTIONS} value={retention.customUnit} onChange={saveCustom} />
              </View>
            </View>
          ) : null}
          {customError ? <Text style={styles.error}>{customError}</Text> : null}
          <SettingsNote>Older scans are deleted automatically.</SettingsNote>
        </View>
      </SettingsSection>

      <Pressable
        style={({ pressed }) => [styles.clearButton, pressed && styles.pressed, history.length === 0 && styles.disabled]}
        onPress={clearHistory}
        disabled={history.length === 0}
        accessibilityRole="button"
      >
        <Text style={styles.clearText}>
          {history.length === 0 ? "Scan history is empty" : "Clear scan history"}
        </Text>
      </Pressable>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  historyBody: {
    padding: 10,
    gap: 10,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customInput: {
    width: 64,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 15,
    textAlign: "center",
  },
  unitPicker: {
    flex: 1,
  },
  error: {
    color: THEME.colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.caption,
  },
  clearButton: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.danger,
  },
  clearText: {
    color: THEME.colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
});
