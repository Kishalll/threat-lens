import React from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { THEME } from "../../constants/theme";

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
  styles: any;
  settingsLoading: boolean;
  protectedFolderDisplay: string;
  deviceSnapshot: DeviceSnapshot | null;
  isAllSet: boolean;
  onChangeFolder: () => void;
  onResetFolder: () => void;
}

export default function SettingsPanel({
  styles,
  settingsLoading,
  protectedFolderDisplay,
  deviceSnapshot,
  isAllSet,
  onChangeFolder,
  onResetFolder,
}: SettingsPanelProps) {
  const okColor = THEME.colors.accent;
  const badColor = THEME.colors.danger;

  return (
    <View style={styles.card}>
      {settingsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={THEME.colors.accent} />
          <Text style={styles.loadingText}>Loading trust settings...</Text>
        </View>
      ) : (
        <>
          {Platform.OS === "android" ? (
            <View style={styles.folderManagementCard}>
              <Text style={styles.resultTitle}>Protected Export Folder</Text>
              <Text style={[styles.resultLine, { fontSize: 15, color: THEME.colors.textPrimary }]}>{protectedFolderDisplay}</Text>
              <View style={styles.settingsActionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}
                  onPress={onChangeFolder}
                >
                  <Feather name="folder-plus" size={16} color={THEME.colors.textPrimary} />
                  <Text style={styles.secondaryButtonText}>Change Folder</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}
                  onPress={onResetFolder}
                >
                  <Feather name="rotate-ccw" size={16} color={THEME.colors.textPrimary} />
                  <Text style={styles.secondaryButtonText}>Reset</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {deviceSnapshot ? (
            <View
              style={[
                styles.snapshotCard,
                { borderColor: isAllSet ? okColor : badColor },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text style={styles.resultTitle}>Device Trust State</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: isAllSet ? `${okColor}22` : `${badColor}22`,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: THEME.radius.pill,
                    borderWidth: 1,
                    borderColor: isAllSet ? `${okColor}66` : `${badColor}66`,
                  }}
                >
                  <Feather name={isAllSet ? "check-circle" : "alert-circle"} size={12} color={isAllSet ? okColor : badColor} />
                  <Text style={{ color: isAllSet ? okColor : badColor, fontSize: 11, fontWeight: "700", fontFamily: THEME.fontFamily.dmSans }}>
                    {isAllSet ? "All Set" : "Needs Action"}
                  </Text>
                </View>
              </View>
              <Text style={styles.resultLine}>
                Install ID: <Text style={{ color: deviceSnapshot.installID ? okColor : badColor }}>{deviceSnapshot.installID ?? "Not generated"}</Text>
              </Text>
              <Text style={styles.resultLine}>
                Device key: <Text style={{ color: deviceSnapshot.hasDeviceKey ? okColor : badColor }}>{deviceSnapshot.hasDeviceKey ? "Present" : "Missing"}</Text>
              </Text>
              <Text style={styles.resultLine}>
                Master cert: <Text style={{ color: deviceSnapshot.hasMasterCert ? okColor : badColor }}>{deviceSnapshot.hasMasterCert ? "Present" : "Missing"}</Text>
              </Text>
              <Text style={styles.resultLine}>
                API key: <Text style={{ color: deviceSnapshot.hasApiKey ? okColor : badColor }}>{deviceSnapshot.hasApiKey ? "Present" : "Missing"}</Text>
              </Text>
              <Text style={styles.resultLine}>
                Master public key: <Text style={{ color: deviceSnapshot.hasMasterPublicKey ? okColor : badColor }}>{deviceSnapshot.hasMasterPublicKey ? "Present" : "Missing"}</Text>
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
