import React, { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { THEME } from "../../constants/theme";
import SettingsModal from "./SettingsModal";

interface SettingsButtonProps {
  title: string;
  children: React.ReactNode;
}

// Gear for the top right of a tab header; opens that tab's settings card.
export default function SettingsButton({ title, children }: SettingsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
        hitSlop={8}
      >
        <Feather name="settings" size={20} color={THEME.colors.textPrimary} />
      </Pressable>
      <SettingsModal visible={open} title={title} onClose={() => setOpen(false)}>
        {children}
      </SettingsModal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: THEME.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
});
