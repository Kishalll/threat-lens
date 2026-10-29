import Feather from "@expo/vector-icons/Feather";
import type { ReactElement } from "react";
import { Text, View } from "react-native";

import { THEME, type ThemeColors } from "../constants/theme";
import { makeStyles, useTheme } from "../hooks/useTheme";
import type { ScanResult } from "../types";

type ClassificationCardProps = {
  result: ScanResult;
};

// Same colour for the label and, at 14% opacity, the card tint.
function classificationColor(colors: ThemeColors, classification: ScanResult["classification"]): string {
  return {
    SAFE: colors.accent,
    PROMO: colors.promo,
    SCAM: colors.danger,
    PHISHING: colors.danger,
    UNAVAILABLE: colors.textTertiary,
  }[classification];
}

function getClassificationIcon(
  classification: ScanResult["classification"]
): "check-circle" | "info" | "alert-triangle" | "alert-octagon" | "slash" {
  if (classification === "UNAVAILABLE") {
    return "slash";
  }

  if (classification === "SAFE") {
    return "check-circle";
  }

  if (classification === "PROMO") {
    return "info";
  }

  if (classification === "PHISHING") {
    return "alert-octagon";
  }

  return "alert-triangle";
}

export default function ClassificationCard({
  result,
}: ClassificationCardProps): ReactElement {
  const styles = useStyles();
  const { colors } = useTheme();
  const accentColor = classificationColor(colors, result.classification);
  const tintColor = `${accentColor}24`;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: accentColor,
          backgroundColor: tintColor,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.classificationWrap}>
          <Feather
            name={getClassificationIcon(result.classification)}
            size={18}
            color={accentColor}
          />
          <Text style={[styles.classificationLabel, { color: accentColor }]}>
            {result.classification}
          </Text>
        </View>
        <Text style={styles.confidenceText}>{result.confidence.toFixed(1)}%</Text>
      </View>

      <Text style={styles.explanationText}>{result.explanation}</Text>

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionTitle}>Red flags</Text>
        {result.redFlags.length > 0 ? (
          result.redFlags.map((flag, index) => (
            <Text key={`${flag}-${index}`} style={styles.listText}>
              {`\u2022 ${flag}`}
            </Text>
          ))
        ) : (
          <Text style={styles.listText}>None found.</Text>
        )}
      </View>

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionTitle}>What to do</Text>
        {result.suggestedActions.length > 0 ? (
          result.suggestedActions.map((action, index) => (
            <Text key={`${action}-${index}`} style={styles.listText}>
              {`${index + 1}. ${action}`}
            </Text>
          ))
        ) : (
          <Text style={styles.listText}>Nothing to do.</Text>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    borderWidth: 1,
    borderRadius: THEME.radius.md,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  classificationWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  classificationLabel: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  confidenceText: {
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 15,
    color: colors.textPrimary,
  },
  explanationText: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  sectionWrap: {
    gap: 6,
  },
  sectionTitle: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  listText: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
}));