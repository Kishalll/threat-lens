import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ProtectPanel from "../../src/components/shield/ProtectPanel";
import SettingsPanel from "../../src/components/shield/SettingsPanel";
import VerifyPanel from "../../src/components/shield/VerifyPanel";
import {
  statusMeta,
  type ShieldMode,
  useShieldController,
} from "../../src/components/shield/useShieldController";
import { useToast } from "../../src/hooks/useToast";
import { THEME } from "../../src/constants/theme";
import { makeStyles, useTheme } from "../../src/hooks/useTheme";
import SettingsButton from "../../src/components/settings/SettingsButton";

export default function ShieldScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastComponent } = useToast();
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
    verifyCancelling,
    verifyLoading,
    verifyResult,
    verifySourceUri,
    cancelProtectFlow,
    cancelVerifyFlow,
    changeProtectedFolder,
    pickProtectImage,
    pickVerifyImage,
    refreshSettings,
    resetProtectState,
    resetProtectedFolder,
    resetVerifyState,
    runProtectFlow,
    runVerifyFlow,
    saveToGallery,
    selectMode,
  } = useShieldController(showToast);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Image Shield</Text>
        <SettingsButton title="Shield settings" onOpen={() => void refreshSettings()}>
          <SettingsPanel
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
        </SettingsButton>
      </View>
      <Text style={styles.subtitle}>
        Add a Digital Fingerprint to your photos. Verify if an image has been Tampered with.
      </Text>

      <View style={styles.modeSwitcher}>
        {(["protect", "verify"] as ShieldMode[]).map((value) => {
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
            onCancel={cancelProtectFlow}
          />
        ) : null}

        {mode === "verify" ? (
          <VerifyPanel
            styles={styles}
            verifySourceUri={verifySourceUri}
            verifyResult={verifyResult}
            verifyLoading={verifyLoading}
            verifyCancelling={verifyCancelling}
            statusMeta={statusMeta(colors)}
            onReset={resetVerifyState}
            onPickImage={() => {
              void pickVerifyImage();
            }}
            onVerify={() => {
              void runVerifyFlow();
            }}
            onCancel={cancelVerifyFlow}
          />
        ) : null}

        {errorMessage ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
      </ScrollView>
      {ToastComponent}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    paddingTop: 56,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: THEME.typography.h1,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeChipActive: {
    borderColor: `${colors.accent}AA`,
    backgroundColor: `${colors.accent}1C`,
  },
  modeChipText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    fontSize: 13,
  },
  modeChipTextActive: {
    color: colors.accent,
  },
  scroll: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: THEME.typography.h2,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderColor: colors.border,
  },
  placeholderBox: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
  },
  placeholderText: {
    color: colors.textTertiary,
    marginTop: 12,
    fontFamily: THEME.fontFamily.dmSans,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  resultCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: THEME.radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: 12,
    gap: 6,
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
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  resultLine: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    lineHeight: 18,
  },
  detailLine: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    lineHeight: 16,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.border,
    borderWidth: 1,
    color: colors.textPrimary,
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
    backgroundColor: colors.accent,
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
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: THEME.fontFamily.dmSans,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: THEME.radius.md,
    gap: 6,
    flex: 1,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: THEME.fontFamily.dmSans,
  },
  cancelButton: {
    backgroundColor: `${colors.danger}1F`,
    borderWidth: 1,
    borderColor: `${colors.danger}8F`,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: THEME.radius.md,
    gap: 6,
    flex: 1,
  },
  cancelButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: THEME.fontFamily.dmSans,
  },
  disabledButton: {
    opacity: 0.55,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: `${colors.accent}9A`,
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
    color: colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    fontSize: 13,
  },
  clearButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: colors.surfaceMuted,
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
    backgroundColor: `${colors.danger}1F`,
    padding: 14,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: `${colors.danger}8F`,
    marginBottom: 24,
  },
  errorText: {
    color: colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  pressedButton: {
    transform: [{ scale: 0.985 }],
  },
}));
