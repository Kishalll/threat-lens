import React from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { THEME } from "../../constants/theme";

interface DeviceSnapshot {
  installID: string | null;
  hasDeviceKey: boolean;
  hasMasterCert: boolean;
  registerUrl: string | null;
  verifyUrl: string | null;
}

interface SettingsPanelProps {
  styles: any;
  settingsLoading: boolean;
  settingsSaving: boolean;
  registryBaseUrl: string;
  registryApiKey: string;
  masterPublicPem: string;
  protectedFolderDisplay: string;
  deviceSnapshot: DeviceSnapshot | null;
  onChangeRegistryBaseUrl: (value: string) => void;
  onChangeRegistryApiKey: (value: string) => void;
  onChangeMasterPublicPem: (value: string) => void;
  onSaveSettings: () => void;
  onChangeFolder: () => void;
  onResetFolder: () => void;
  maskSecret: (value: string) => string;
}

export default function SettingsPanel({
  styles,
  settingsLoading,
  settingsSaving,
  registryBaseUrl,
  registryApiKey,
  masterPublicPem,
  protectedFolderDisplay,
  deviceSnapshot,
  onChangeRegistryBaseUrl,
  onChangeRegistryApiKey,
  onChangeMasterPublicPem,
  onSaveSettings,
  onChangeFolder,
  onResetFolder,
  maskSecret,
}: SettingsPanelProps) {
  return (
    <View style={styles.card}>
      {settingsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={THEME.colors.accent} />
          <Text style={styles.loadingText}>Loading trust settings...</Text>
        </View>
      ) : (
        <>
          <Text style={styles.inputLabel}>Trust Registry Base URL</Text>
          <TextInput
            style={styles.input}
            value={registryBaseUrl}
            onChangeText={onChangeRegistryBaseUrl}
            autoCapitalize="none"
            placeholder="https://region-project.cloudfunctions.net"
            placeholderTextColor={THEME.colors.textTertiary}
          />

          <Text style={styles.inputLabel}>Registry API Key</Text>
          <TextInput
            style={styles.input}
            value={registryApiKey}
            onChangeText={onChangeRegistryApiKey}
            autoCapitalize="none"
            placeholder="Optional bearer token"
            placeholderTextColor={THEME.colors.textTertiary}
          />

          <Text style={styles.inputLabel}>Master Public Key (PEM)</Text>
          <TextInput
            style={[styles.input, styles.multiInput]}
            value={masterPublicPem}
            onChangeText={onChangeMasterPublicPem}
            autoCapitalize="none"
            multiline
            placeholder="-----BEGIN PUBLIC KEY-----"
            placeholderTextColor={THEME.colors.textTertiary}
          />

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              settingsSaving && styles.disabledButton,
              pressed && styles.pressedButton,
            ]}
            disabled={settingsSaving}
            onPress={onSaveSettings}
          >
            {settingsSaving ? (
              <ActivityIndicator size="small" color="#0A0F14" />
            ) : (
              <>
                <Feather name="save" size={18} color="#0A0F14" />
                <Text style={styles.primaryButtonText}>Save Settings</Text>
              </>
            )}
          </Pressable>

          {Platform.OS === "android" ? (
            <View style={styles.folderManagementCard}>
              <Text style={styles.resultTitle}>Protected Export Folder</Text>
              <Text style={styles.resultLine}>{protectedFolderDisplay}</Text>
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
            <View style={styles.snapshotCard}>
              <Text style={styles.resultTitle}>Device Trust State</Text>
              <Text style={styles.resultLine}>
                Install ID: {deviceSnapshot.installID ?? "Not generated"}
              </Text>
              <Text style={styles.resultLine}>
                Device key: {deviceSnapshot.hasDeviceKey ? "Present" : "Missing"}
              </Text>
              <Text style={styles.resultLine}>
                Master cert: {deviceSnapshot.hasMasterCert ? "Present" : "Missing"}
              </Text>
              <Text style={styles.resultLine}>
                Register URL: {deviceSnapshot.registerUrl ?? "Not configured"}
              </Text>
              <Text style={styles.resultLine}>
                Verify URL: {deviceSnapshot.verifyUrl ?? "Not configured"}
              </Text>
              {registryApiKey.trim().length > 0 ? (
                <Text style={styles.resultLine}>API key: {maskSecret(registryApiKey.trim())}</Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
