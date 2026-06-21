import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import Feather from "@expo/vector-icons/Feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import ProtectPanel from "../../src/components/shield/ProtectPanel";
import SettingsPanel from "../../src/components/shield/SettingsPanel";
import VerifyPanel from "../../src/components/shield/VerifyPanel";
import {
  getImageTrustSettingsSnapshot,
  protectImageWithSignature,
  verifySignedImage,
} from "../../src/services/imageTrustService";
import type {
  SignedImagePayload,
  VerificationResult,
  VerificationStatus,
} from "../../src/types/imageTrust";
import {
  MASTER_PUBLIC_KEY_PEM_KEY_NAME,
  TRUST_REGISTRY_API_KEY_NAME,
  TRUST_REGISTRY_BASE_URL_KEY_NAME,
  getMasterPublicKeyPem,
  getTrustRegistryApiKey,
  getTrustRegistryBaseUrl,
  getKey,
  setKey,
} from "../../src/services/secureKeyService";
import { THEME } from "../../src/constants/theme";
import { log } from "../../src/utils/activityLog";

type ShieldMode = "protect" | "verify" | "settings";
type ProtectStep = "idle" | "picked" | "signing" | "done" | "error";
const PROTECTED_ALBUM_NAME = "ThreatLens Protected";
const PROTECTED_EXPORT_DIR_URI_KEY = "THREATLENS_PROTECTED_EXPORT_DIR_URI";

const STATUS_META: Record<
  VerificationStatus,
  { label: string; color: string; icon: React.ComponentProps<typeof Feather>["name"] }
> = {
  AUTHENTIC: { label: "Authentic", color: THEME.colors.accent, icon: "check-circle" },
  TAMPERED: { label: "Tampered", color: THEME.colors.danger, icon: "alert-triangle" },
  INVALID_SIGNATURE: {
    label: "Invalid Signature",
    color: THEME.colors.danger,
    icon: "x-octagon",
  },
  CLONE_APP: { label: "Clone App", color: THEME.colors.danger, icon: "slash" },
  REVOKED: { label: "Revoked", color: THEME.colors.warning, icon: "shield-off" },
  OFFLINE: { label: "Offline", color: THEME.colors.warning, icon: "wifi-off" },
  NO_PROTECTION: {
    label: "No Protection",
    color: THEME.colors.textTertiary,
    icon: "help-circle",
  },
  CORRUPT: { label: "Corrupt", color: THEME.colors.danger, icon: "alert-circle" },
};

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return value;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export default function ShieldScreen() {
  const [mode, setMode] = useState<ShieldMode>("protect");

  const [protectSourceUri, setProtectSourceUri] = useState<string | null>(null);
  const [signedImageUri, setSignedImageUri] = useState<string | null>(null);
  const [protectPayload, setProtectPayload] = useState<SignedImagePayload | null>(null);
  const [protectStep, setProtectStep] = useState<ProtectStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [verifySourceUri, setVerifySourceUri] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState<boolean>(false);
  const [verifyCloudCheck, setVerifyCloudCheck] = useState<boolean>(true);

  const [settingsLoading, setSettingsLoading] = useState<boolean>(true);
  const [settingsSaving, setSettingsSaving] = useState<boolean>(false);
  const [registryBaseUrl, setRegistryBaseUrl] = useState<string>("");
  const [registryApiKey, setRegistryApiKey] = useState<string>("");
  const [masterPublicPem, setMasterPublicPem] = useState<string>("");
  const [protectedExportDirUri, setProtectedExportDirUri] = useState<string | null>(null);
  const [deviceSnapshot, setDeviceSnapshot] = useState<{
    installID: string | null;
    hasDeviceKey: boolean;
    hasMasterCert: boolean;
    registerUrl: string | null;
    verifyUrl: string | null;
  } | null>(null);

  const insets = useSafeAreaInsets();

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const [baseUrl, apiKey, masterPem, snapshot] = await Promise.all([
        getTrustRegistryBaseUrl(),
        getTrustRegistryApiKey(),
        getMasterPublicKeyPem(),
        getImageTrustSettingsSnapshot(),
      ]);
      const savedProtectedDirUri = await getKey(PROTECTED_EXPORT_DIR_URI_KEY);

      setRegistryBaseUrl(baseUrl ?? "");
      setRegistryApiKey(apiKey ?? "");
      setMasterPublicPem(masterPem ?? "");
      setDeviceSnapshot(snapshot);
      setProtectedExportDirUri(
        typeof savedProtectedDirUri === "string" && savedProtectedDirUri.trim().length > 0
          ? savedProtectedDirUri.trim()
          : null
      );
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const resetProtectState = () => {
    setProtectSourceUri(null);
    setSignedImageUri(null);
    setProtectPayload(null);
    setProtectStep("idle");
    setErrorMessage(null);
  };

  const resetVerifyState = () => {
    setVerifySourceUri(null);
    setVerifyResult(null);
    setErrorMessage(null);
  };

  const pickProtectImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    setProtectSourceUri(result.assets[0].uri);
    setSignedImageUri(null);
    setProtectPayload(null);
    setProtectStep("picked");
    setErrorMessage(null);
  };

  const pickVerifyImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      ...(Platform.OS === "android" ? { legacy: true } : {}),
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    setVerifySourceUri(result.assets[0].uri);
    setVerifyResult(null);
    setErrorMessage(null);
  };

  const runProtectFlow = async () => {
    if (!protectSourceUri) {
      return;
    }

    setProtectStep("signing");
    setErrorMessage(null);

    try {
      const result = await protectImageWithSignature(protectSourceUri);

      setSignedImageUri(result.protectedUri);
      setProtectPayload(result.payload);
      setProtectStep("done");

      log("img_protected", "Successfully signed image");

      useDashboardStore.getState().incrementProtectedImagesCount();
      await loadSettings();
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unable to sign this image.";
      setErrorMessage(message);
      setProtectStep("error");
    }
  };

  const runVerifyFlow = async () => {
    if (!verifySourceUri) {
      return;
    }

    setVerifyLoading(true);
    setErrorMessage(null);

    try {
      const result = await verifySignedImage(verifySourceUri, {
        cloudCheck: verifyCloudCheck,
      });
      setVerifyResult(result);

      if (result.status === "AUTHENTIC") {
        log("img_verified", result.summary);
      } else {
        log("img_verify_fail", result.summary);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Verification failed.";
      
      log("img_verify_fail", message);
      setErrorMessage(message);
      setVerifyResult(null);
    } finally {
      setVerifyLoading(false);
    }
  };

  const requestProtectedDirectoryUri = async (): Promise<string | null> => {
    if (Platform.OS !== "android") {
      return null;
    }

    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) {
      return null;
    }

    await setKey(PROTECTED_EXPORT_DIR_URI_KEY, permission.directoryUri);
    setProtectedExportDirUri(permission.directoryUri);
    return permission.directoryUri;
  };

  const getProtectedDirectoryUri = async (): Promise<string | null> => {
    if (protectedExportDirUri) {
      return protectedExportDirUri;
    }

    const stored = await getKey(PROTECTED_EXPORT_DIR_URI_KEY);
    if (typeof stored === "string" && stored.trim().length > 0) {
      const normalized = stored.trim();
      setProtectedExportDirUri(normalized);
      return normalized;
    }

    return requestProtectedDirectoryUri();
  };

  const changeProtectedFolder = async () => {
    try {
      const directoryUri = await requestProtectedDirectoryUri();
      if (!directoryUri) {
        Alert.alert("Folder Not Changed", "No folder selected.");
        return;
      }
      Alert.alert("Updated", "Protected folder updated.");
    } catch {
      Alert.alert("Update Failed", "Could not change protected folder.");
    }
  };

  const resetProtectedFolder = async () => {
    try {
      await setKey(PROTECTED_EXPORT_DIR_URI_KEY, "");
      setProtectedExportDirUri(null);
      Alert.alert("Reset", "Protected folder selection cleared.");
    } catch {
      Alert.alert("Reset Failed", "Could not reset protected folder.");
    }
  };

  const protectedFolderDisplay = useMemo(() => {
    if (!protectedExportDirUri) {
      return "Not selected";
    }

    const decoded = decodeURIComponent(protectedExportDirUri);
    const marker = "/tree/";
    const index = decoded.indexOf(marker);
    if (index >= 0) {
      return decoded.slice(index + marker.length);
    }
    return decoded;
  }, [protectedExportDirUri]);

  const saveToGallery = async () => {
    if (!signedImageUri) {
      return;
    }

    const saveWithStorageAccessFramework = async (directoryUri: string): Promise<void> => {
      const base64Data = await FileSystem.readAsStringAsync(signedImageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const filename = `threatlens_protected_${Date.now()}.jpg`;
      const destinationUri = await FileSystem.StorageAccessFramework.createFileAsync(
        directoryUri,
        filename,
        "image/jpeg"
      );

      await FileSystem.writeAsStringAsync(destinationUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
    };

    try {
      if (Platform.OS === "android") {
        let directoryUri = await getProtectedDirectoryUri();
        if (!directoryUri) {
          Alert.alert(
            "Folder Required",
            "Choose a folder (recommended: ThreatLens Protected) to save signed images."
          );
          return;
        }

        try {
          await saveWithStorageAccessFramework(directoryUri);
        } catch {
          // Directory permissions can expire after reinstall. Ask user to pick folder again once.
          directoryUri = await requestProtectedDirectoryUri();
          if (!directoryUri) {
            Alert.alert(
              "Folder Required",
              "Choose a folder to save signed images."
            );
            return;
          }

          await saveWithStorageAccessFramework(directoryUri);
        }

        Alert.alert("Saved", "Signed image saved to your selected protected folder.");
        return;
      }

      const { status } = await MediaLibrary.requestPermissionsAsync(false, ["photo"]);
      if (status === "granted") {
        const asset = await MediaLibrary.createAssetAsync(signedImageUri);
        const existingAlbums = await MediaLibrary.getAlbumsAsync();
        const targetAlbum = existingAlbums.find((album) => album.title === PROTECTED_ALBUM_NAME);

        if (targetAlbum) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], targetAlbum, false);
        } else {
          await MediaLibrary.createAlbumAsync(PROTECTED_ALBUM_NAME, asset, false);
        }

        Alert.alert("Saved", `Signed image saved to '${PROTECTED_ALBUM_NAME}' album.`);
      } else {
        Alert.alert("Permission Required", "Allow gallery permission to save image.");
      }
    } catch {
      Alert.alert("Save Failed", "Could not save signed image.");
    }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    setErrorMessage(null);
    try {
      await setKey(TRUST_REGISTRY_BASE_URL_KEY_NAME, registryBaseUrl.trim());
      await setKey(TRUST_REGISTRY_API_KEY_NAME, registryApiKey.trim());
      await setKey(MASTER_PUBLIC_KEY_PEM_KEY_NAME, masterPublicPem.trim());
      await loadSettings();
      Alert.alert("Saved", "Trust settings updated.");
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Could not save trust settings.";
      setErrorMessage(message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const modeTitle = useMemo(() => {
    if (mode === "protect") return "Protect";
    if (mode === "verify") return "Verify";
    return "Settings";
  }, [mode]);

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Image Shield</Text>
      <Text style={styles.subtitle}>
        Device-signed image trust with local verification and optional cloud registry checks.
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
                setMode(value);
                setErrorMessage(null);
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
        <Text style={styles.sectionTitle}>{modeTitle} Flow</Text>

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
            settingsSaving={settingsSaving}
            registryBaseUrl={registryBaseUrl}
            registryApiKey={registryApiKey}
            masterPublicPem={masterPublicPem}
            protectedFolderDisplay={protectedFolderDisplay}
            deviceSnapshot={deviceSnapshot}
            onChangeRegistryBaseUrl={setRegistryBaseUrl}
            onChangeRegistryApiKey={setRegistryApiKey}
            onChangeMasterPublicPem={setMasterPublicPem}
            onSaveSettings={() => {
              void saveSettings();
            }}
            onChangeFolder={() => {
              void changeProtectedFolder();
            }}
            onResetFolder={() => {
              void resetProtectedFolder();
            }}
            maskSecret={maskSecret}
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
    marginTop: 14,
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
