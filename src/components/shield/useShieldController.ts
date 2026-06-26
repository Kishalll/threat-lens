import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import Feather from "@expo/vector-icons/Feather";

import { useDashboardStore } from "../../stores/dashboardStore";
import {
  getImageTrustSettingsSnapshot,
  protectImageWithSignature,
  verifySignedImage,
} from "../../services/imageTrustService";
import type {
  SignedImagePayload,
  VerificationResult,
  VerificationStatus,
} from "../../types/imageTrust";
import {
  getKey,
  setKey,
} from "../../services/secureKeyService";
import { THEME } from "../../constants/theme";
import { log } from "../../utils/activityLog";
import type { ToastVariant } from "../../hooks/useToast";

export type ShieldMode = "protect" | "verify" | "settings";
type ProtectStep = "idle" | "picked" | "signing" | "done" | "error";

interface ShieldDeviceSnapshot {
  installID: string | null;
  hasDeviceKey: boolean;
  hasMasterCert: boolean;
  registerUrl: string | null;
  verifyUrl: string | null;
  hasApiKey: boolean;
  hasMasterPublicKey: boolean;
}

const PROTECTED_ALBUM_NAME = "ThreatLens Protected";
const PROTECTED_EXPORT_DIR_URI_KEY = "THREATLENS_PROTECTED_EXPORT_DIR_URI";

export const STATUS_META: Record<
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

export function useShieldController(showToast: (msg: string, variant?: ToastVariant) => void) {
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
  const [protectedExportDirUri, setProtectedExportDirUri] = useState<string | null>(null);
  const [deviceSnapshot, setDeviceSnapshot] = useState<ShieldDeviceSnapshot | null>(null);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const [snapshot] = await Promise.all([
        getImageTrustSettingsSnapshot(),
      ]);
      const savedProtectedDirUri = await getKey(PROTECTED_EXPORT_DIR_URI_KEY);

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

  const resetProtectState = useCallback(() => {
    setProtectSourceUri(null);
    setSignedImageUri(null);
    setProtectPayload(null);
    setProtectStep("idle");
    setErrorMessage(null);
  }, []);

  const resetVerifyState = useCallback(() => {
    setVerifySourceUri(null);
    setVerifyResult(null);
    setErrorMessage(null);
  }, []);

  const pickProtectImage = useCallback(async () => {
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
  }, []);

  const pickVerifyImage = useCallback(async () => {
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
  }, []);

  const runProtectFlow = useCallback(async () => {
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
  }, [loadSettings, protectSourceUri]);

  const runVerifyFlow = useCallback(async () => {
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
  }, [verifyCloudCheck, verifySourceUri]);

  const requestProtectedDirectoryUri = useCallback(async (): Promise<string | null> => {
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
  }, []);

  const getProtectedDirectoryUri = useCallback(async (): Promise<string | null> => {
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
  }, [protectedExportDirUri, requestProtectedDirectoryUri]);

  const changeProtectedFolder = useCallback(async () => {
    try {
      const directoryUri = await requestProtectedDirectoryUri();
      if (!directoryUri) {
        return;
      }
      showToast("Protected folder updated.", "success");
    } catch {
      showToast("Could not change protected folder.", "error");
    }
  }, [requestProtectedDirectoryUri, showToast]);

  const resetProtectedFolder = useCallback(async () => {
    try {
      await setKey(PROTECTED_EXPORT_DIR_URI_KEY, "");
      setProtectedExportDirUri(null);
      showToast("Protected folder selection cleared.", "success");
    } catch {
      showToast("Could not reset protected folder.", "error");
    }
  }, [showToast]);

  const protectedFolderDisplay = useMemo(() => {
    if (!protectedExportDirUri) {
      return "Not selected";
    }

    const decoded = decodeURIComponent(protectedExportDirUri);
    const marker = "/tree/";
    const index = decoded.indexOf(marker);
    if (index >= 0) {
      return decoded.slice(index + marker.length).replace(/^primary:\s*/i, "");
    }
    return decoded.replace(/^primary:\s*/i, "");
  }, [protectedExportDirUri]);

  const saveToGallery = useCallback(async () => {
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
          showToast("Choose a folder to save signed images.", "error");
          return;
        }

        try {
          await saveWithStorageAccessFramework(directoryUri);
        } catch {
          directoryUri = await requestProtectedDirectoryUri();
          if (!directoryUri) {
            showToast("Choose a folder to save signed images.", "error");
            return;
          }

          await saveWithStorageAccessFramework(directoryUri);
        }

        showToast("Signed image saved to your protected folder.", "success");
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

        showToast(`Signed image saved to '${PROTECTED_ALBUM_NAME}' album.`, "success");
      } else {
        showToast("Allow gallery permission to save image.", "error");
      }
    } catch {
      showToast("Could not save signed image.", "error");
    }
  }, [getProtectedDirectoryUri, requestProtectedDirectoryUri, signedImageUri, showToast]);

  const selectMode = useCallback((nextMode: ShieldMode) => {
    setMode(nextMode);
    setErrorMessage(null);
  }, []);

  const modeTitle = useMemo(() => {
    if (mode === "protect") return "Protect";
    if (mode === "verify") return "Verify";
    return "Settings";
  }, [mode]);

  const isAllSet = useMemo(() => {
    if (!deviceSnapshot) return false;
    return (
      deviceSnapshot.registerUrl !== null &&
      deviceSnapshot.verifyUrl !== null &&
      deviceSnapshot.hasDeviceKey &&
      deviceSnapshot.hasMasterCert &&
      deviceSnapshot.hasApiKey &&
      deviceSnapshot.hasMasterPublicKey
    );
  }, [deviceSnapshot]);

  return {
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
  };
}
