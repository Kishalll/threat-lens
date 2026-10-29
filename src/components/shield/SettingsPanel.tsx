import React from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { THEME } from "../../constants/theme";
import { makeStyles, useTheme } from "../../hooks/useTheme";
import { SettingsRow, SettingsSection } from "../settings/SettingsControls";

interface DeviceSnapshot {
  installID: string | null;
  hasDeviceKey: boolean;
  hasMasterCert: boolean;
  registerUrl: string | null;
  verifyUrl: string | null;
  hasApiKey: boolean;
  hasMasterPublicKey: boolean;
}

interface SettingsPanelProps {
  settingsLoading: boolean;
  protectedFolderDisplay: string;
  deviceSnapshot: DeviceSnapshot | null;
  isAllSet: boolean;
  onChangeFolder: () => void;
  onResetFolder: () => void;
}

function Presence({ present }: { present: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Text style={[styles.value, { color: present ? colors.accent : colors.danger }]}>
      {present ? "Present" : "Missing"}
    </Text>
  );
}

export default function SettingsPanel({
  settingsLoading,
  protectedFolderDisplay,
  deviceSnapshot,
  isAllSet,
  onChangeFolder,
  onResetFolder,
}: SettingsPanelProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (settingsLoading && !deviceSnapshot) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.loadingText}>Loading trust settings...</Text>
      </View>
    );
  }

  const statusColor = isAllSet ? colors.accent : colors.danger;

  return (
    <>
      {Platform.OS === "android" ? (
        <SettingsSection title="Protected export folder">
          <View style={styles.folderBody}>
            <Text style={styles.folderText}>{protectedFolderDisplay}</Text>
            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                onPress={onChangeFolder}
              >
                <Feather name="folder-plus" size={16} color={colors.textPrimary} />
                <Text style={styles.actionText}>Change folder</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                onPress={onResetFolder}
              >
                <Feather name="rotate-ccw" size={16} color={colors.textPrimary} />
                <Text style={styles.actionText}>Reset</Text>
              </Pressable>
            </View>
          </View>
        </SettingsSection>
      ) : null}

      {deviceSnapshot ? (
        <SettingsSection title="Device trust state">
          <SettingsRow
            first
            label="Status"
            right={
              <View style={[styles.chip, { borderColor: statusColor, backgroundColor: `${statusColor}22` }]}>
                <Feather name={isAllSet ? "check-circle" : "alert-circle"} size={12} color={statusColor} />
                <Text style={[styles.chipText, { color: statusColor }]}>{isAllSet ? "All set" : "Needs action"}</Text>
              </View>
            }
          />
          <SettingsRow
            label="Install ID"
            right={
              <Text style={[styles.mono, !deviceSnapshot.installID && { color: colors.danger }]} numberOfLines={1}>
                {deviceSnapshot.installID ?? "Not generated"}
              </Text>
            }
          />
          <SettingsRow label="Device key" right={<Presence present={deviceSnapshot.hasDeviceKey} />} />
          <SettingsRow label="Master cert" right={<Presence present={deviceSnapshot.hasMasterCert} />} />
          <SettingsRow label="Master public key" right={<Presence present={deviceSnapshot.hasMasterPublicKey} />} />
          <SettingsRow label="Registry API key" right={<Presence present={deviceSnapshot.hasApiKey} />} />
        </SettingsSection>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
  },
  folderBody: {
    padding: 14,
    gap: 12,
  },
  folderText: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  actionText: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.7,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 11,
    fontWeight: "700",
  },
  value: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    fontWeight: "700",
  },
  mono: {
    maxWidth: 150,
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
  },
}));
