import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";

import type { SignedImagePayload } from "../../types/imageTrust";
import { THEME } from "../../constants/theme";

interface ProtectPanelProps {
  styles: any;
  protectSourceUri: string | null;
  signedImageUri: string | null;
  protectPayload: SignedImagePayload | null;
  protectStep: "idle" | "picked" | "signing" | "cancelling" | "done" | "error";
  onReset: () => void;
  onPickImage: () => void;
  onProtect: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function ProtectPanel({
  styles,
  protectSourceUri,
  signedImageUri,
  protectPayload,
  protectStep,
  onReset,
  onPickImage,
  onProtect,
  onSave,
  onCancel,
}: ProtectPanelProps) {
  const isSigning = protectStep === "signing";
  const isCancelling = protectStep === "cancelling";
  const isBusy = isSigning || isCancelling;

  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        {signedImageUri ? (
          <Image source={{ uri: signedImageUri }} style={styles.imageBox} />
        ) : protectSourceUri ? (
          <Image source={{ uri: protectSourceUri }} style={styles.imageBox} />
        ) : (
          <View style={[styles.imageBox, styles.placeholderBox]}>
            <Feather name="image" size={44} color={THEME.colors.textTertiary} />
            <Text style={styles.placeholderText}>Select a photo to sign</Text>
          </View>
        )}
        {(protectSourceUri || signedImageUri) && !isBusy && (
          <TouchableOpacity style={styles.clearButton} onPress={onReset}>
            <Feather name="x" size={20} color={THEME.colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionsRow}>
        {isCancelling ? (
          <View style={[styles.cancelButton, styles.disabledButton]}>
            <ActivityIndicator size="small" color={THEME.colors.danger} />
            <Text style={styles.cancelButtonText}>Cancelling...</Text>
          </View>
        ) : isSigning ? (
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressedButton]}
            onPress={onCancel}
          >
            <Feather name="x" size={18} color={THEME.colors.danger} />
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}
            onPress={onPickImage}
          >
            <Feather name="upload" size={18} color={THEME.colors.textPrimary} />
            <Text style={styles.secondaryButtonText}>Select</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            (!protectSourceUri || isBusy) && styles.disabledButton,
            pressed && styles.pressedButton,
          ]}
          disabled={!protectSourceUri || isBusy}
          onPress={onProtect}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#0A0F14" />
          ) : (
            <>
              <Feather name="shield" size={18} color="#0A0F14" />
              <Text style={styles.primaryButtonText}>Protect</Text>
            </>
          )}
        </Pressable>
      </View>

      {protectStep === "done" && protectPayload ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Signed Payload</Text>
          <Text style={styles.resultLine}>Install: {protectPayload.installID}</Text>
          <Text style={styles.resultLine}>
            Signed at: {new Date(protectPayload.timestamp).toLocaleString()}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressedButton]}
            onPress={onSave}
          >
            <Feather name="download" size={16} color={THEME.colors.accent} />
            <Text style={styles.outlineButtonText}>Save Signed Image</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
