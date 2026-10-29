import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useScannerStore } from "../../src/stores/scannerStore";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import { effectiveSuggestedActions } from "../../src/stores/dashboardDerived";
import { getScanResult } from "../../src/services/storageService";
import { THEME } from "../../src/constants/theme";
import { makeStyles, useTheme } from "../../src/hooks/useTheme";
import type { ScanResult } from "../../src/types";

export default function ScanResultScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { index, id, encodedResult, source } = useLocalSearchParams<{ index?: string; id?: string; encodedResult?: string; source?: string }>();
  const router = useRouter();
  const scannerStore = useScannerStore();
  const suggestions = useDashboardStore((state) => state.suggestions);
  const registerSuggestions = useDashboardStore((state) => state.registerSuggestions);
  const markSuggestionAsDone = useDashboardStore((state) => state.markSuggestionAsDone);
  const [dbRecord, setDbRecord] = useState<ScanResult | null>(null);

  // Decode result passed directly from notification tap (avoids SQLite in headless context)
  const decodedRecord = useMemo<ScanResult | null>(() => {
    if (!encodedResult) return null;
    try {
      return JSON.parse(decodeURIComponent(escape(atob(encodedResult)))) as ScanResult;
    } catch {
      return null;
    }
  }, [encodedResult]);

  const parsedIndex = Number(index);
  const recordById = id ? scannerStore.history.find((item) => item.id === id) : undefined;
  const recordByIndex = Number.isInteger(parsedIndex) ? scannerStore.history[parsedIndex] : undefined;
  const record = decodedRecord ?? recordById ?? recordByIndex ?? dbRecord ?? scannerStore.history[0];
  const openedFromNotification = source === "notification";

  const handleBackNavigation = useCallback(() => {
    if (openedFromNotification) {
      router.replace("/(tabs)/scanner");
      return;
    }
    router.back();
  }, [openedFromNotification, router]);

  // If not found anywhere else, try SQLite
  useEffect(() => {
    if (!id || recordById || decodedRecord) return;
    getScanResult(id).then((result) => {
      if (result) setDbRecord(result);
    });
  }, [id, recordById, decodedRecord]);

  useEffect(() => {
    if (!openedFromNotification) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBackNavigation();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [handleBackNavigation, openedFromNotification]);

  const trackedSuggestions = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          suggestion.source === "scan" && suggestion.sourceId === (record?.id ?? "")
      ),
    [suggestions, record?.id]
  );

  useEffect(() => {
    const actions = record ? effectiveSuggestedActions(record) : [];
    if (!record || actions.length === 0) {
      return;
    }

    registerSuggestions("scan", record.id, actions);
  }, [record, registerSuggestions]);

  if (!record) {
    return (
      <View style={styles.container}>
        <Text style={{color: colors.textPrimary}}>Scan result not found.</Text>
        <Pressable onPress={handleBackNavigation} style={{marginTop: 20}}><Text style={{color: colors.statusGood}}>Go Back</Text></Pressable>
      </View>
    );
  }

  const isUnavailable = record.classification === "UNAVAILABLE";
  const isDangerous = record.classification === "SCAM" || record.classification === "PHISHING";
  const mainColor = isUnavailable
    ? colors.muted
    : isDangerous
    ? colors.statusBad
    : record.classification === "PROMO"
    ? colors.promo
    : colors.statusGood;
  const iconName = isUnavailable
    ? "slash"
    : isDangerous
    ? "alert-octagon"
    : record.classification === "PROMO"
    ? "tag"
    : "shield";
  return (
    <ScrollView style={styles.container}>
      <Pressable style={({ pressed }) => [styles.backHeader, pressed && styles.pressedButton]} onPress={handleBackNavigation}>
        <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        <Text style={styles.backTitle}>Back to Scanner</Text>
      </Pressable>

      <View style={[styles.headerCard, { borderColor: mainColor }]}>
        <View style={[styles.headerTint, { backgroundColor: `${mainColor}11` }]} />
        <Feather name={iconName} size={48} color={mainColor} style={{marginBottom: 16}} />
        <Text style={styles.classificationTitle}>{record.classification}</Text>
        <Text style={styles.confidenceText}>Confidence: {record.confidence}%</Text>
      </View>

      <Text style={styles.sectionTitle}>Why</Text>
      <Text style={styles.explanationText}>{record.explanation}</Text>

      {record.redFlags && record.redFlags.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Red flags</Text>
          <View style={styles.listContainer}>
            {record.redFlags.map((flag, i) => (
              <View key={i} style={styles.listItem}>
                <Feather name="flag" size={16} color={colors.statusBad} />
                <Text style={styles.listText}>{flag}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {trackedSuggestions.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>What to do</Text>
          <View style={styles.listContainer}>
            {trackedSuggestions.map((suggestion) => (
              <View key={suggestion.id} style={styles.listItem}>
                <Feather
                  name={suggestion.acted ? "check-square" : suggestion.isFallback ? "info" : "square"}
                  size={16}
                  color={suggestion.acted ? colors.statusGood : colors.muted}
                />
                <Text style={styles.listText}>{suggestion.text}</Text>
                {!suggestion.isFallback ? (
                  <Pressable
                    style={[
                      styles.doneButton,
                      suggestion.acted && styles.doneButtonCompleted,
                    ]}
                    onPress={() => markSuggestionAsDone(suggestion.id)}
                    disabled={suggestion.acted}
                  >
                    <Text
                      style={[
                        styles.doneButtonText,
                        suggestion.acted && styles.doneButtonTextCompleted,
                      ]}
                    >
                      {suggestion.acted ? "Done" : "Mark as Done"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Message</Text>
      <View style={styles.previewCard}>
        <Text style={styles.previewText}>{record.messagePreview}...</Text>
      </View>

      <View style={{height: 60}} />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    paddingTop: 56,
  },
  backHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: THEME.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: THEME.fontFamily.dmSans,
    marginLeft: 8,
    fontWeight: "700",
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: THEME.radius.lg,
    padding: 32,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 7,
    // Solid base: with a see-through fill, Android draws the shadow inside the card.
    backgroundColor: colors.background,
  },
  headerTint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: THEME.radius.lg,
  },
  classificationTitle: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
  },
  confidenceText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 16,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: THEME.typography.h2,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 8,
  },
  explanationText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 24,
  },
  listContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: THEME.radius.md,
    padding: 16,
    marginBottom: 24,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  listText: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  doneButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: `${colors.accent}1F`,
  },
  doneButtonCompleted: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  doneButtonText: {
    color: colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    fontWeight: "700",
  },
  doneButtonTextCompleted: {
    color: colors.textTertiary,
  },
  previewCard: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
    lineHeight: 18,
  }
  ,
  pressedButton: {
    transform: [{ scale: 0.985 }],
  },
}));
