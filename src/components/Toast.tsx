import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { THEME, type ThemeColors } from "../constants/theme";
import { makeStyles, useTheme } from "../hooks/useTheme";

export type ToastVariant = "success" | "error" | "info";

interface ToastProps {
  message: string | null;
  variant: ToastVariant;
  onHide: () => void;
}

function variantConfig(
  colors: ThemeColors
): Record<ToastVariant, { border: string; icon: React.ComponentProps<typeof Feather>["name"]; iconColor: string }> {
  return {
    success: { border: colors.accent, icon: "check-circle", iconColor: colors.accent },
    error: { border: colors.danger, icon: "alert-circle", iconColor: colors.danger },
    info: { border: colors.textTertiary, icon: "info", iconColor: colors.textTertiary },
  };
}

export default function Toast({ message, variant, onHide }: ToastProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const config = variantConfig(colors)[variant];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!message) return;

    opacity.setValue(1);
    scale.setValue(1);

    timerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.85, duration: 300, useNativeDriver: true }),
      ]).start(() => onHide());
    }, 2000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [message]);

  if (!message) return null;

  return (
    <View style={styles.backdrop} pointerEvents="none">
      <Animated.View
        style={[
          styles.card,
          { borderColor: config.border, opacity, transform: [{ scale }] },
        ]}
      >
        <Feather name={config.icon} size={28} color={config.iconColor} />
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: THEME.radius.lg,
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: "center",
    gap: 12,
    width: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  text: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
}));
