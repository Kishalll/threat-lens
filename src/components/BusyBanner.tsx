import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { THEME } from "../constants/theme";
import { makeStyles, useTheme } from "../hooks/useTheme";
import { useBusyStore } from "../stores/busyStore";

const TITLES = {
  protect: "Protecting photo.",
  verify: "Checking image.",
};

// Sits just above the tab bar on every tab while protect or verify runs.
// The spinner is native, so it keeps turning while JS is busy.
export default function BusyBanner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const reason = useBusyStore((state) => state.reason);

  if (!reason) return null;

  return (
    <View style={styles.banner} pointerEvents="none" accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.accent} />
      <Text style={styles.text}>
        {TITLES[reason]} Taps are paused until it's done.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  banner: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 90,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: THEME.radius.lg,
    backgroundColor: colors.surfaceMuted,
    elevation: 10,
  },
  text: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    lineHeight: 18,
  },
}));
