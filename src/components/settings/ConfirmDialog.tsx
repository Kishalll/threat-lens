import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { THEME } from "../../constants/theme";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  onClose: () => void;
}

// In-app confirm for destructive actions, styled like the rest of the app
// instead of the system alert. Opens above any settings card.
export default function ConfirmDialog({ request, onClose }: ConfirmDialogProps) {
  return (
    <Modal visible={request !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cancel" />
        {request ? (
          <View style={styles.card} accessibilityRole="alert">
            <View style={styles.iconWrap}>
              <Feather name="alert-triangle" size={20} color={THEME.colors.danger} />
            </View>
            <Text style={styles.title}>{request.title}</Text>
            <Text style={styles.message}>{request.message}</Text>
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.button, styles.cancelButton, pressed && styles.pressed]}
                onPress={onClose}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.button, styles.confirmButton, pressed && styles.pressed]}
                onPress={() => {
                  onClose();
                  request.onConfirm();
                }}
                accessibilityRole="button"
              >
                <Text style={styles.confirmText}>{request.confirmLabel}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    backgroundColor: THEME.colors.backgroundElevated,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    padding: 20,
    gap: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: THEME.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${THEME.colors.danger}22`,
  },
  title: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.h2,
    fontWeight: "700",
  },
  message: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
    lineHeight: 21,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: THEME.radius.sm,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
  },
  confirmButton: {
    backgroundColor: THEME.colors.danger,
  },
  cancelText: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
    fontWeight: "700",
  },
  confirmText: {
    color: "#0A0F14",
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.7,
  },
});
