import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import Feather from "@expo/vector-icons/Feather";

import { useDashboardStore } from "../../stores/dashboardStore";
import {
  getImageTrustSettingsSnapshot,
  isAbortError,
  protectImageWithSignature,
  verifySignedImage,
} from "../../services/imageTrustService";
import type {
  SignedImagePayload,
  VerificationResult,
  VerificationStatus,
} from "../../types/imageTrust";
import { getKey, setKey, PROTECTED_EXPORT_DIR_URI_KEY } from "../../services/secureKeyService";
import type { ThemeColors } from "../../constants/theme";
import { log } from "../../utils/activityLog";
import type { ToastVariant } from "../../hooks/useToast";

export type ShieldMode = "protect" | "verify";
export type ProtectStep = "idle" | "picked" | "signing" | "cancelling" | "done" | "error";

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

// Verify result labels and colours, in the current theme's palette.
export function statusMeta(
  colors: ThemeColors
): Record<VerificationStatus, { label: string; color: string; icon: React.ComponentProps<typeof Feather>["name"] }> {
  return {
    AUTHENTIC: { label: "Authentic", color: colors.accent, icon: "check-circle" },
    TAMPERED: { label: "Tampered", color: colors.danger, icon: "alert-triangle" },
    INVALID_SIGNATURE: {
      label: "Invalid Signature",
      color: colors.danger,
      icon: "x-octagon",
    },
    CLONE_APP: { label: "Clone App", color: colors.danger, icon: "slash" },
    REVOKED: { label: "Revoked", color: colors.warning, icon: "shield-off" },
    OFFLINE: { label: "Offline", color: colors.warning, icon: "wifi-off" },
    NO_PROTECTION: {
      label: "No Protection",
      color: colors.textTertiary,
      icon: "help-circle",
    },
    INTEGRITY_VERIFIED: {
      label: "Intact (Offline)",
      color: colors.warning,
      icon: "check",
    },
    CORRUPT: { label: "Corrupt", color: colors.danger, icon: "alert-circle" },
  };
}

export function useShieldController(showToast: (msg: string, variant?: ToastVariant) => void) {
  const [mode, setMode] = useState<ShieldMode>("protect");

  const [protectSourceUri, setProtectSourceUri] = useState<string | null>(null);
  const [signedImageUri, setSignedImageUri] = useState<string | null>(null);
  const [protectPayload, setProtectPayload] = useState<SignedImagePayload | null>(null);
  const [protectStep, setProtectStep] = useState<ProtectStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // In-flight protect run bookkeeping (refs so cancel works without re-render races).
  const protectAbortRef = useRef<AbortController | null>(null);
  const protectCancelledRef = useRef<boolean>(false);
  const protectRunIdRef = useRef<number>(0);

  const [verifySourceUri, setVerifySourceUri] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState<boolean>(false);
  const [verifyCancelling, setVerifyCancelling] = useState<boolean>(false);

  // In-flight verify run bookkeeping, kept separate from protect's.
  const verifyAbortRef = useRef<AbortController | null>(null);
  const verifyCancelledRef = useRef<boolean>(false);
  const verifyRunIdRef = useRef<number>(0);

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
    // Invalidate and abort any in-flight protect run so it cannot overwrite the reset state.
    protectRunIdRef.current += 1;
    protectAbortRef.current?.abort();
    protectAbortRef.current = null;
    protectCancelledRef.current = false;

    setProtectSourceUri(null);
    setSignedImageUri(null);
    setProtectPayload(null);
    setProtectStep("idle");
    setErrorMessage(null);
  }, []);

  const resetVerifyState = useCallback(() => {
    // Invalidate and abort any in-flight verify run so it cannot overwrite the reset state.
    verifyRunIdRef.current += 1;
    verifyAbortRef.current?.abort();
    verifyAbortRef.current = null;
    verifyCancelledRef.current = false;

    setVerifySourceUri(null);
    setVerifyResult(null);
    setVerifyLoading(false);
    setVerifyCancelling(false);
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
    if (!protectSourceUri || protectAbortRef.current) {
      return;
    }

    const runId = protectRunIdRef.current + 1;
    protectRunIdRef.current = runId;
    const controller = new AbortController();
    protectAbortRef.current = controller;
    protectCancelledRef.current = false;
    const isStale = () => protectRunIdRef.current !== runId;

    setProtectStep("signing");
    setErrorMessage(null);

    try {
      const result = await protectImageWithSignature(protectSourceUri, {
        signal: controller.signal,
        isCancelled: () => protectCancelledRef.current || isStale(),
      });

      if (isStale()) {
        // Reset pressed mid-run: discard the output, state was already cleared.
        await FileSystem.deleteAsync(result.protectedUri, { idempotent: true }).catch(() => {});
        return;
      }

      if (protectCancelledRef.current) {
        // Cancel landed after the last service checkpoint: revert, do not publish the result.
        await FileSystem.deleteAsync(result.protectedUri, { idempotent: true }).catch(() => {});
        setProtectStep("picked");
        return;
      }

      setSignedImageUri(result.protectedUri);
      setProtectPayload(result.payload);
      setProtectStep("done");

      log("img_protected", "Successfully signed image");

      useDashboardStore.getState().incrementProtectedImagesCount();
      await loadSettings();
    } catch (error) {
      if (isStale()) {
        return;
      }

      if (protectCancelledRef.current || isAbortError(error)) {
        // Cancelled: nothing was kept, return to the "image selected" state.
        setSignedImageUri(null);
        setProtectPayload(null);
        setErrorMessage(null);
        setProtectStep("picked");
        return;
      }

      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unable to sign this image.";
      setErrorMessage(message);
      setProtectStep("error");
    } finally {
      if (!isStale()) {
        protectAbortRef.current = null;
        protectCancelledRef.current = false;
      }
    }
  }, [loadSettings, protectSourceUri]);

  const cancelProtectFlow = useCallback(() => {
    const controller = protectAbortRef.current;
    if (!controller || protectCancelledRef.current) {
      return;
    }

    // Show "Cancelling..." immediately; the run unwinds in the background.
    protectCancelledRef.current = true;
    setProtectStep("cancelling");
    controller.abort();
  }, []);

  const runVerifyFlow = useCallback(async () => {
    if (!verifySourceUri || verifyAbortRef.current) {
      return;
    }

    const runId = verifyRunIdRef.current + 1;
    verifyRunIdRef.current = runId;
    const controller = new AbortController();
    verifyAbortRef.current = controller;
    verifyCancelledRef.current = false;
    const isStale = () => verifyRunIdRef.current !== runId;

    setVerifyLoading(true);
    setVerifyCancelling(false);
    setErrorMessage(null);

    try {
      const result = await verifySignedImage(verifySourceUri, {
        signal: controller.signal,
        isCancelled: () => verifyCancelledRef.current || isStale(),
      });

      // Reset, or a cancel that landed after the last checkpoint: drop the result.
      if (isStale() || verifyCancelledRef.current) {
        return;
      }
      setVerifyResult(result);

      if (result.status === "AUTHENTIC" || result.status === "INTEGRITY_VERIFIED") {
        log("img_verified", result.summary);
      } else {
        log("img_verify_fail", result.summary);
      }
    } catch (error) {
      if (isStale()) {
        return;
      }

      if (verifyCancelledRef.current || isAbortError(error)) {
        // Cancelled: show nothing, keep the selected image.
        setVerifyResult(null);
        setErrorMessage(null);
        return;
      }

      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Verification failed.";

      log("img_verify_fail", message);
      setErrorMessage(message);
      setVerifyResult(null);
    } finally {
      if (!isStale()) {
        verifyAbortRef.current = null;
        verifyCancelledRef.current = false;
        setVerifyLoading(false);
        setVerifyCancelling(false);
      }
    }
  }, [verifySourceUri]);

  const cancelVerifyFlow = useCallback(() => {
    const controller = verifyAbortRef.current;
    if (!controller || verifyCancelledRef.current) {
      return;
    }

    // Show "Cancelling..." immediately; the run unwinds in the background.
    verifyCancelledRef.current = true;
    setVerifyCancelling(true);
    controller.abort();
  }, []);

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

  const modeTitle = mode === "protect" ? "Protect" : "Verify";

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
    verifyCancelling,
    verifyLoading,
    verifyResult,
    verifySourceUri,
    cancelProtectFlow,
    cancelVerifyFlow,
    changeProtectedFolder,
    pickProtectImage,
    pickVerifyImage,
    resetProtectState,
    resetProtectedFolder,
    refreshSettings: loadSettings,
    resetVerifyState,
    runProtectFlow,
    runVerifyFlow,
    saveToGallery,
    selectMode,
  };
}
