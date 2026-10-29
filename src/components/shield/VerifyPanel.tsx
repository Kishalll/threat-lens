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

import type { VerificationResult } from "../../types/imageTrust";
import { useTheme } from "../../hooks/useTheme";

interface VerifyPanelProps {
  styles: any;
  verifySourceUri: string | null;
  verifyResult: VerificationResult | null;
  verifyLoading: boolean;
  verifyCancelling: boolean;
  statusMeta: Record<string, { label: string; color: string; icon: React.ComponentProps<typeof Feather>["name"] }>;
  onReset: () => void;
  onPickImage: () => void;
  onVerify: () => void;
  onCancel: () => void;
}

export default function VerifyPanel({
  styles,
  verifySourceUri,
  verifyResult,
  verifyLoading,
  verifyCancelling,
  statusMeta,
  onReset,
  onPickImage,
  onVerify,
  onCancel,
}: VerifyPanelProps) {
  const { colors } = useTheme();
  const isVerifying = verifyLoading && !verifyCancelling;

  // The JS thread is blocked while decoding and reading the watermark, so the
  // cancel tap flips this on the UI thread and "Cancelling..." shows without waiting for JS.
  const cancelTapped = useSharedValue(0);

  useEffect(() => {
    cancelTapped.value = verifyCancelling ? 1 : 0;
  }, [verifyLoading, verifyCancelling]);

  const cancelTap = Gesture.Tap()
    .enabled(isVerifying)
    .onStart(() => {
      cancelTapped.value = 1;
      scheduleOnRN(onCancel);
    });

  const cancelLabelStyle = useAnimatedStyle(() => ({ opacity: 1 - cancelTapped.value }));
  const cancellingStyle = useAnimatedStyle(() => ({ opacity: cancelTapped.value }));
  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        {verifySourceUri ? (
          <Image source={{ uri: verifySourceUri }} style={styles.imageBox} />
        ) : (
          <View style={[styles.imageBox, styles.placeholderBox]}>
            <Feather name="search" size={44} color={colors.textTertiary} />
            <Text style={styles.placeholderText}>Pick an image to check</Text>
          </View>
        )}
        {verifySourceUri && !verifyLoading && (
          <TouchableOpacity style={styles.clearButton} onPress={onReset}>
            <Feather name="x" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionsRow}>
        {verifyLoading ? (
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
            (!verifySourceUri || verifyLoading) && styles.disabledButton,
            pressed && styles.pressedButton,
          ]}
          disabled={!verifySourceUri || verifyLoading}
          onPress={onVerify}
        >
          {verifyLoading ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <>
              <Feather name="check-square" size={18} color={colors.onAccent} />
              <Text style={styles.primaryButtonText}>Verify</Text>
            </>
          )}
        </Pressable>
      </View>

      {verifyResult ? (
        <View style={styles.resultCard}>
          <View style={styles.statusHeader}>
            <Feather
              name={statusMeta[verifyResult.status].icon}
              size={20}
              color={statusMeta[verifyResult.status].color}
            />
            <Text
              style={[
                styles.statusTitle,
                { color: statusMeta[verifyResult.status].color },
              ]}
            >
              {statusMeta[verifyResult.status].label}
            </Text>
          </View>
          <Text style={styles.resultLine}>{verifyResult.summary}</Text>
          <Text style={styles.resultLine}>
            Hash check: <Text style={{ color: verifyResult.checks.hashCheck ? colors.accent : colors.danger }}>{verifyResult.checks.hashCheck ? "PASS" : "FAIL"}</Text>
          </Text>
          <Text style={styles.resultLine}>
            Signature check: <Text style={{ color: verifyResult.checks.signatureCheck ? colors.accent : colors.danger }}>{verifyResult.checks.signatureCheck ? "PASS" : "FAIL"}</Text>
          </Text>
          <Text style={styles.resultLine}>
            Master cert check: <Text style={{ color: verifyResult.checks.masterCertCheck ? colors.accent : colors.danger }}>{verifyResult.checks.masterCertCheck ? "PASS" : "FAIL"}</Text>
          </Text>
          <Text style={styles.resultLine}>
            Cloud check: <Text style={{ color: verifyResult.checks.cloudCheck === "passed" ? colors.accent : verifyResult.checks.cloudCheck === "failed" ? colors.danger : verifyResult.checks.cloudCheck === "offline" ? colors.warning : colors.textTertiary }}>{verifyResult.checks.cloudCheck.toUpperCase()}</Text>
          </Text>
          {typeof verifyResult.pHashDistance === "number" ? (
            <Text style={styles.resultLine}>pHash distance: <Text style={{ color: verifyResult.pHashDistance <= 8 ? colors.accent : colors.danger }}>{verifyResult.pHashDistance}</Text></Text>
          ) : null}
          {verifyResult.details.map((detail) => (
            <Text key={detail} style={styles.detailLine}>
              • {detail}
            </Text>
          ))}
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
