import React, { useState } from "react";
import { Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { THEME } from "../../constants/theme";
import { makeStyles, useTheme } from "../../hooks/useTheme";
import SettingsModal from "./SettingsModal";

interface SettingsButtonProps {
  title: string;
  onOpen?: () => void;
  children: React.ReactNode;
}

// Gear for the top right of a tab header; opens that tab's settings card.
export default function SettingsButton({ title, onOpen, children }: SettingsButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={() => {
          setOpen(true);
          onOpen?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
        hitSlop={8}
      >
        <Feather name="settings" size={20} color={colors.textPrimary} />
      </Pressable>
      <SettingsModal visible={open} title={title} onClose={() => setOpen(false)}>
        {children}
      </SettingsModal>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    width: 40,
    height: 40,
    borderRadius: THEME.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
}));
