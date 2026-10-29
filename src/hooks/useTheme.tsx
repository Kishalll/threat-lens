import React, { createContext, useContext, useEffect } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";

import { DARK_COLORS, LIGHT_COLORS, type ThemeColors, type ThemeScheme } from "../constants/theme";
import { useSettingsStore } from "../stores/settingsStore";

interface ThemeValue {
  scheme: ThemeScheme;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeValue>({ scheme: "dark", colors: DARK_COLORS });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSettingsStore((state) => state.settings.general.theme);
  const system = useColorScheme();
  const scheme: ThemeScheme = preference === "system" ? (system === "light" ? "light" : "dark") : preference;
  const colors = scheme === "light" ? LIGHT_COLORS : DARK_COLORS;

  // The root window shows through during navigation; keep it in step.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors]);

  return (
    <ThemeContext.Provider value={{ scheme, colors }}>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

// Styles built from the current palette, created once per theme.
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: ThemeColors) => T): () => T {
  const cache = new Map<ThemeColors, T>();
  return function useStyles(): T {
    const { colors } = useTheme();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(factory(colors));
      cache.set(colors, styles);
    }
    return styles;
  };
}
