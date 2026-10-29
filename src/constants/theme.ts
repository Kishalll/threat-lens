export type ThemeScheme = "dark" | "light";

export interface ThemeColors {
  background: string;
  backgroundElevated: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  accent: string;
  warning: string;
  danger: string;
  promo: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  // Text and icons drawn on accent or danger fills.
  onAccent: string;
  scrim: string;
  switchThumbOff: string;
  switchTrackOff: string;
  switchTrackOn: string;
  statusGood: string;
  statusBad: string;
  statusWarn: string;
  // "No status" outline, also used as a marker by FeatureSummaryCard.
  neutral: string;
  muted: string;
  hairline: string;
  inputBackground: string;
  faint: string;
}

export const DARK_COLORS: ThemeColors = {
  background: "#090D14",
  backgroundElevated: "#101622",
  surface: "rgba(19, 24, 34, 0.88)",
  surfaceMuted: "rgba(24, 30, 42, 0.82)",
  border: "rgba(255, 255, 255, 0.12)",
  borderStrong: "rgba(255, 255, 255, 0.22)",
  accent: "#83D0AE",
  warning: "#D7AE78",
  danger: "#DC8C8C",
  promo: "#7BA7D0",
  textPrimary: "#F1F4FA",
  textSecondary: "#9EA9BC",
  textTertiary: "#768196",
  onAccent: "#0A0F14",
  scrim: "rgba(0, 0, 0, 0.6)",
  switchThumbOff: "#B8BDC6",
  switchTrackOff: "#4A5160",
  switchTrackOn: "#2B7A5A",
  statusGood: "#4ADE80",
  statusBad: "#F87171",
  statusWarn: "#FBBF24",
  neutral: "#2A2D35",
  muted: "#8B8F99",
  hairline: "rgba(255, 255, 255, 0.08)",
  inputBackground: "rgba(10, 14, 22, 0.68)",
  faint: "rgba(255, 255, 255, 0.03)",
};

export const LIGHT_COLORS: ThemeColors = {
  background: "#F3F5F8",
  backgroundElevated: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "rgba(255, 255, 255, 0.96)",
  border: "rgba(9, 13, 20, 0.10)",
  borderStrong: "rgba(9, 13, 20, 0.20)",
  accent: "#2E8B66",
  warning: "#A9773A",
  danger: "#B9504F",
  promo: "#3D72A6",
  textPrimary: "#121821",
  textSecondary: "#4F5B6E",
  textTertiary: "#7A8597",
  onAccent: "#FFFFFF",
  scrim: "rgba(9, 13, 20, 0.35)",
  switchThumbOff: "#FFFFFF",
  switchTrackOff: "#C9CFD8",
  switchTrackOn: "#8FCBB2",
  statusGood: "#1F9D55",
  statusBad: "#C2413D",
  statusWarn: "#B7791F",
  neutral: "#E3E7ED",
  muted: "#6B7280",
  hairline: "rgba(9, 13, 20, 0.06)",
  inputBackground: "#FFFFFF",
  faint: "rgba(9, 13, 20, 0.03)",
};

// Sizes and fonts are the same in both themes. Colours come from useTheme().
export const THEME = {
  borderRadius: 20,
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    pill: 999,
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
  typography: {
    display: 34,
    h1: 28,
    h2: 20,
    body: 15,
    caption: 12,
  },
  fontFamily: {
    dmSans: "DMSans-Regular",
    jetbrainsMono: "JetBrainsMono-Regular",
  },
} as const;
