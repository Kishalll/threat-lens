import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Feather from "@expo/vector-icons/Feather";

import type { SignedImagePayload } from "../../types/imageTrust";
import { useTheme } from "../../hooks/useTheme";

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
  const { colors } = useTheme();
  const isSigning = protectStep === "signing";
  const isCancelling = protectStep === "cancelling";
  const isBusy = isSigning || isCancelling;

  // The JS thread is blocked while signing, so the cancel tap flips this on the
  // UI thread and "Cancelling..." shows without waiting for JS.
  const cancelTapped = useSharedValue(0);

  useEffect(() => {
    cancelTapped.value = isCancelling ? 1 : 0;
  }, [protectStep]);

  const cancelTap = Gesture.Tap()
    .enabled(isSigning)
    .onStart(() => {
      cancelTapped.value = 1;
      scheduleOnRN(onCancel);
    });

  const cancelLabelStyle = useAnimatedStyle(() => ({ opacity: 1 - cancelTapped.value }));
  const cancellingStyle = useAnimatedStyle(() => ({ opacity: cancelTapped.value }));

  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        {signedImageUri ? (
          <Image source={{ uri: signedImageUri }} style={styles.imageBox} />
        ) : protectSourceUri ? (
          <Image source={{ uri: protectSourceUri }} style={styles.imageBox} />
        ) : (
          <View style={[styles.imageBox, styles.placeholderBox]}>
            <Feather name="image" size={44} color={colors.textTertiary} />
            <Text style={styles.placeholderText}>Select a photo to sign</Text>
          </View>
        )}
        {(protectSourceUri || signedImageUri) && !isBusy && (
          <TouchableOpacity style={styles.clearButton} onPress={onReset}>
            <Feather name="x" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionsRow}>
        {isBusy ? (
          <GestureDetector gesture={cancelTap}>
            <Animated.View style={styles.cancelButton} accessibilityRole="button">
              <Animated.View style={[local.row, cancelLabelStyle]}>
                <Feather name="x" size={18} color={colors.danger} />
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, local.row, cancellingStyle]}>
                <ActivityIndicator size="small" color={colors.danger} />
                <Text style={styles.cancelButtonText}>Cancelling...</Text>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}
            onPress={onPickImage}
          >
            <Feather name="upload" size={18} color={colors.textPrimary} />
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
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <>
              <Feather name="shield" size={18} color={colors.onAccent} />
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
            <Feather name="download" size={16} color={colors.accent} />
            <Text style={styles.outlineButtonText}>Save Signed Image</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});
