import Feather from "@expo/vector-icons/Feather";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { THEME } from "../constants/theme";
import type { ScanResult } from "../types";

type ClassificationCardProps = {
  result: ScanResult;
};

const CLASSIFICATION_COLORS: Record<ScanResult["classification"], string> = {
  SAFE: "#83D0AE",
  PROMO: "#7BA7D0",
  SPAM: "#D7AE78",
  SCAM: "#DC8C8C",
  PHISHING: "#DC8C8C",
  UNAVAILABLE: "#768196",
};

const CLASSIFICATION_BACKGROUNDS: Record<ScanResult["classification"], string> = {
  SAFE: "rgba(131,208,174,0.14)",
  PROMO: "rgba(123,167,208,0.14)",
  SPAM: "rgba(215,174,120,0.14)",
  SCAM: "rgba(220,140,140,0.14)",
  PHISHING: "rgba(220,140,140,0.14)",
  UNAVAILABLE: "rgba(118,129,150,0.14)",
};

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
  const accentColor = CLASSIFICATION_COLORS[result.classification];
  const tintColor = CLASSIFICATION_BACKGROUNDS[result.classification];

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
        <Text style={styles.sectionTitle}>Red Flags</Text>
        {result.redFlags.length > 0 ? (
          result.redFlags.map((flag, index) => (
            <Text key={`${flag}-${index}`} style={styles.listText}>
              {`\u2022 ${flag}`}
            </Text>
          ))
        ) : (
          <Text style={styles.listText}>None identified.</Text>
        )}
      </View>

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionTitle}>Suggested Actions</Text>
        {result.suggestedActions.length > 0 ? (
          result.suggestedActions.map((action, index) => (
            <Text key={`${action}-${index}`} style={styles.listText}>
              {`${index + 1}. ${action}`}
            </Text>
          ))
        ) : (
          <Text style={styles.listText}>No immediate action suggested.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: THEME.colors.textPrimary,
  },
  explanationText: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    color: THEME.colors.textPrimary,
    lineHeight: 20,
  },
  sectionWrap: {
    gap: 6,
  },
  sectionTitle: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    color: THEME.colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  listText: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    color: THEME.colors.textPrimary,
    lineHeight: 20,
  },
});