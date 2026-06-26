import React from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ProtectPanel from "../../src/components/shield/ProtectPanel";
import SettingsPanel from "../../src/components/shield/SettingsPanel";
import VerifyPanel from "../../src/components/shield/VerifyPanel";
import {
  STATUS_META,
  type ShieldMode,
  useShieldController,
} from "../../src/components/shield/useShieldController";
import { THEME } from "../../src/constants/theme";

export default function ShieldScreen() {
  const insets = useSafeAreaInsets();
  const {
    deviceSnapshot,
    errorMessage,
    isAllSet,
    mode,
    modeTitle,
    protectPayload,
    protectSourceUri,
    protectStep,
    protectedFolderDisplay,
    settingsLoading,
    signedImageUri,
    verifyCloudCheck,
    verifyLoading,
    verifyResult,
    verifySourceUri,
    changeProtectedFolder,
    pickProtectImage,
    pickVerifyImage,
    resetProtectState,
    resetProtectedFolder,
    resetVerifyState,
    runProtectFlow,
    runVerifyFlow,
    saveToGallery,
    selectMode,
    setVerifyCloudCheck,
  } = useShieldController();

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Image Shield</Text>
      <Text style={styles.subtitle}>
        Add a Digital Fingerprint to your photos. Verify if an image has been Tampered with.
      </Text>

      <View style={styles.modeSwitcher}>
        {(["protect", "verify", "settings"] as ShieldMode[]).map((value) => {
          const active = mode === value;
          return (
            <Pressable
              key={value}
              style={({ pressed }) => [
                styles.modeChip,
                active && styles.modeChipActive,
                pressed && styles.pressedButton,
              ]}
              onPress={() => {
                selectMode(value);
              }}
            >
              <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>{modeTitle} </Text>

        {mode === "protect" ? (
          <ProtectPanel
            styles={styles}
            protectSourceUri={protectSourceUri}
            signedImageUri={signedImageUri}
            protectPayload={protectPayload}
            protectStep={protectStep}
            onReset={resetProtectState}
            onPickImage={() => {
              void pickProtectImage();
            }}
            onProtect={() => {
              void runProtectFlow();
            }}
            onSave={() => {
              void saveToGallery();
            }}
          />
        ) : null}

        {mode === "verify" ? (
          <VerifyPanel
            styles={styles}
            verifySourceUri={verifySourceUri}
            verifyResult={verifyResult}
            verifyLoading={verifyLoading}
            verifyCloudCheck={verifyCloudCheck}
            statusMeta={STATUS_META}
            onReset={resetVerifyState}
            onPickImage={() => {
              void pickVerifyImage();
            }}
            onVerify={() => {
              void runVerifyFlow();
            }}
            onToggleCloudCheck={setVerifyCloudCheck}
          />
        ) : null}

        {mode === "settings" ? (
          <SettingsPanel
            styles={styles}
            settingsLoading={settingsLoading}
            protectedFolderDisplay={protectedFolderDisplay}
            deviceSnapshot={deviceSnapshot}
            isAllSet={isAllSet}
            onChangeFolder={() => {
              void changeProtectedFolder();
            }}
            onResetFolder={() => {
              void resetProtectedFolder();
            }}
          />
        ) : null}

        {errorMessage ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={18} color={THEME.colors.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    padding: 20,
    paddingTop: 56,
  },
  headerTitle: {
    color: THEME.colors.textPrimary,
    fontSize: THEME.typography.h1,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontFamily: THEME.fontFamily.dmSans,
    marginBottom: 16,
    lineHeight: 20,
  },
  modeSwitcher: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  modeChipActive: {
    borderColor: `${THEME.colors.accent}AA`,
    backgroundColor: `${THEME.colors.accent}1C`,
  },
  modeChipText: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    fontSize: 13,
  },
  modeChipTextActive: {
    color: THEME.colors.accent,
  },
  scroll: {
    flex: 1,
  },
  sectionTitle: {
    color: THEME.colors.textPrimary,
    fontSize: THEME.typography.h2,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    marginBottom: 10,
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.lg,
    padding: 14,
    marginBottom: 14,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 14,
  },
  imageBox: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  placeholderBox: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.colors.surfaceMuted,
  },
  placeholderText: {
    color: THEME.colors.textTertiary,
    marginTop: 12,
    fontFamily: THEME.fontFamily.dmSans,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  switchLabel: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
  },
  resultCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.surfaceMuted,
    padding: 12,
    gap: 6,
  },
  snapshotCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.surfaceMuted,
    padding: 12,
    gap: 6,
  },
  folderManagementCard: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.surfaceMuted,
    padding: 12,
    gap: 8,
  },
  settingsActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  statusTitle: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 16,
    fontWeight: "700",
  },
  resultTitle: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  resultLine: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    lineHeight: 18,
  },
  detailLine: {
    color: THEME.colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    lineHeight: 16,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
  },
  inputLabel: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: "rgba(10, 14, 22, 0.68)",
    borderColor: THEME.colors.border,
    borderWidth: 1,
    color: THEME.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: THEME.radius.md,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
    marginBottom: 10,
  },
  multiInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: THEME.colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: THEME.radius.md,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
    flex: 1,
  },
  primaryButtonText: {
    color: "#0A0F14",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: THEME.fontFamily.dmSans,
  },
  secondaryButton: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: THEME.radius.md,
    gap: 6,
    flex: 1,
  },
  secondaryButtonText: {
    color: THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: THEME.fontFamily.dmSans,
  },
  disabledButton: {
    opacity: 0.55,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: `${THEME.colors.accent}9A`,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  outlineButtonText: {
    color: THEME.colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    fontSize: 13,
  },
  clearButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: THEME.colors.surfaceMuted,
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${THEME.colors.danger}1F`,
    padding: 14,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: `${THEME.colors.danger}8F`,
    marginBottom: 24,
  },
  errorText: {
    color: THEME.colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  pressedButton: {
    transform: [{ scale: 0.985 }],
  },
});
