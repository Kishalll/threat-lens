import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useBreachStore } from "../../src/stores/breachStore";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import { THEME } from "../../src/constants/theme";
import type { BreachGuidance } from "../../src/types";

function parseStoredGuidance(value?: string): BreachGuidance | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { summary?: unknown }).summary === "string" &&
      Array.isArray((parsed as { actionItems?: unknown }).actionItems)
    ) {
      return {
        summary: (parsed as { summary: string }).summary,
        actionItems: (parsed as { actionItems: unknown[] }).actionItems.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        ),
        isFallback: Boolean((parsed as { isFallback?: unknown }).isFallback),
      };
    }
  } catch {
    return {
      summary: value.trim(),
      actionItems: [],
      isFallback: false,
    };
  }

  return null;
}

export default function BreachDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const breachStore = useBreachStore();
  const suggestions = useDashboardStore((state) => state.suggestions);
  const getSuggestionsForSource = useDashboardStore((state) => state.getSuggestionsForSource);
  const registerSuggestions = useDashboardStore((state) => state.registerSuggestions);
  const markSuggestionAsDone = useDashboardStore((state) => state.markSuggestionAsDone);
  const requestBreachGuidance = useBreachStore((state) => state.requestBreachGuidance);
  const syncBreachResolutionFromSuggestions = useBreachStore(
    (state) => state.syncBreachResolutionFromSuggestions
  );
  
  const breach = breachStore.breaches.find(b => b.id === id);
  const breachSuggestions = useMemo(
    () => getSuggestionsForSource("breach", breach?.id ?? ""),
    [breach?.id, getSuggestionsForSource, suggestions]
  );
  const actionableSuggestions = useMemo(
    () => breachSuggestions.filter((suggestion) => !suggestion.isFallback),
    [breachSuggestions]
  );
  const storedGuidance = useMemo(
    () => parseStoredGuidance(breach?.aiGuidance),
    [breach?.aiGuidance]
  );
  const breachId = breach?.id;
  const isFetchingRef = useRef(false);
  const [guidance, setGuidance] = useState<BreachGuidance | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);
  const renderedGuidance = storedGuidance ?? guidance;
  const requiredActionItems = useMemo(
    () =>
      renderedGuidance && !renderedGuidance.isFallback
        ? renderedGuidance.actionItems
        : [],
    [renderedGuidance]
  );
  const actedSuggestionsCount = useMemo(
    () =>
      Math.min(
        actionableSuggestions.filter((suggestion) => suggestion.acted).length,
        requiredActionItems.length
      ),
    [actionableSuggestions, requiredActionItems.length]
  );
  const totalSuggestionsCount = requiredActionItems.length;
  const hasGuidance = Boolean(renderedGuidance);
  const isSecured = hasGuidance && (totalSuggestionsCount === 0 || actedSuggestionsCount === totalSuggestionsCount);
  const progressRatio =
    totalSuggestionsCount === 0 ? (hasGuidance ? 1 : 0) : actedSuggestionsCount / totalSuggestionsCount;
  const progressText =
    !hasGuidance
      ? "AI action plan pending"
      : totalSuggestionsCount === 0
      ? hasGuidance
        ? "No action items required"
        : "0 of 0 actions completed"
      : `${actedSuggestionsCount} of ${totalSuggestionsCount} actions completed`;

  useEffect(() => {
    if (!breachId) {
      setLoading(false);
      return;
    }

    if (storedGuidance) {
      setGuidance(null);
      setGuidanceError(null);
      setLoading(false);
      return;
    }

    if (isFetchingRef.current) {
      return;
    }

    let isCancelled = false;
    isFetchingRef.current = true;
    setGuidance(null);
    setGuidanceError(null);
    setLoading(true);

    void requestBreachGuidance(breachId)
      .then(() => {
        if (isCancelled) {
          return;
        }

        const nextBreach = useBreachStore.getState().breaches.find((item) => item.id === breachId);
        const nextGuidance = parseStoredGuidance(nextBreach?.aiGuidance);
        setGuidance(nextGuidance);
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "AI guidance failed to generate right now.";
        setGuidanceError(message);
      })
      .finally(() => {
        isFetchingRef.current = false;
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      isFetchingRef.current = false;
    };
  }, [breach?.id]);

  useEffect(() => {
    if (!breach || loading || !renderedGuidance) {
      return;
    }

    registerSuggestions("breach", breach.id, renderedGuidance.actionItems, {
      isFallback: renderedGuidance.isFallback,
      replaceExisting: true,
    });
  }, [breach, loading, registerSuggestions, renderedGuidance]);

  useEffect(() => {
    if (!breach) {
      return;
    }

    syncBreachResolutionFromSuggestions({
      [breach.id]: isSecured,
    });
  }, [breach, isSecured, syncBreachResolutionFromSuggestions]);

  if (!breach) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Breach not found.</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Pressable style={({ pressed }) => [styles.backHeader, pressed && styles.pressedButton]} onPress={() => router.back()}>
        <Feather name="arrow-left" size={22} color={THEME.colors.textPrimary} />
        <Text style={styles.backTitle}>Back</Text>
      </Pressable>

      <View style={[styles.headerCard, isSecured && styles.headerCardResolved]}>
        <Feather
          name={isSecured ? "check-circle" : "alert-triangle"}
          size={32}
          color={isSecured ? THEME.colors.accent : THEME.colors.danger}
          style={{marginBottom: 12}}
        />
        <Text style={styles.title}>{breach.name}</Text>
        <Text style={styles.date}>Occurred: {new Date(breach.date).toLocaleDateString()}</Text>
        {!!breach.matchedCredential && (
          <Text style={styles.matchedCredential}>
            Matched {breach.matchedCredentialType ?? "credential"}: {breach.matchedCredential}
          </Text>
        )}
        <Text style={[styles.statusText, isSecured ? styles.securedLabel : styles.riskLabel]}>
          {isSecured ? "Secured" : "At Risk"}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(progressRatio * 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>{progressText}</Text>
      </View>

      <Text style={styles.sectionTitle}>What was leaked?</Text>
      <View style={styles.tagsContainer}>
        {breach.dataClasses.map((item, index) => (
          <View key={index} style={styles.dataClassTag}>
            <Text style={styles.dataClassText}>{item}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Description</Text>
      <Text style={styles.body}>{breach.description}</Text>

      <Text style={styles.sectionTitle}>Action Plan (AI Guided)</Text>
      <View style={styles.guidanceCard}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4ADE80" />
            <Text style={styles.loadingText}>Generating AI recovery plan...</Text>
          </View>
        ) : guidanceError ? (
          <Text style={styles.errorText}>{guidanceError}</Text>
        ) : renderedGuidance ? (
          <View style={styles.guidanceStack}>
            <View style={styles.summaryCard}>
              <Text style={styles.subsectionTitle}>Summary</Text>
              <Text style={styles.guidanceText}>{renderedGuidance.summary}</Text>
            </View>

            <View style={styles.actionCard}>
              <Text style={styles.subsectionTitle}>Action Items</Text>
              {breachSuggestions.length > 0 ? (
                breachSuggestions.map((suggestion) => (
                  <View key={suggestion.id} style={styles.suggestionRow}>
                    <Text style={styles.guidanceText}>{suggestion.text}</Text>
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
                ))
              ) : (
                <Text style={styles.guidanceText}>No follow-up actions were generated.</Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={styles.guidanceText}>No guidance available yet.</Text>
        )}
      </View>

      <View style={{height: 60}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    padding: 20,
    paddingTop: 56,
  },
  backHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  backTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 15,
    fontFamily: THEME.fontFamily.dmSans,
    marginLeft: 8,
    fontWeight: "700",
  },
  headerCard: {
    backgroundColor: THEME.colors.surface,
    borderColor: `${THEME.colors.danger}88`,
    borderWidth: 1,
    padding: 22,
    borderRadius: THEME.radius.lg,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 7,
  },
  headerCardResolved: {
    borderColor: `${THEME.colors.accent}88`,
    backgroundColor: `${THEME.colors.accent}14`,
  },
  title: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  date: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 14,
    marginTop: 8,
  },
  matchedCredential: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
    marginTop: 10,
  },
  statusText: {
    marginTop: 12,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    fontWeight: "700",
  },
  securedLabel: {
    color: THEME.colors.accent,
  },
  riskLabel: {
    color: THEME.colors.danger,
  },
  progressTrack: {
    marginTop: 10,
    width: "100%",
    height: 6,
    borderRadius: THEME.radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: THEME.radius.pill,
    backgroundColor: THEME.colors.accent,
  },
  progressText: {
    marginTop: 8,
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
  },
  sectionTitle: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.h2,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 12,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  dataClassTag: {
    backgroundColor: `${THEME.colors.warning}20`,
    borderColor: `${THEME.colors.warning}9A`,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.pill,
  },
  dataClassText: {
    color: THEME.colors.warning,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
    fontWeight: "700",
  },
  body: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 24,
  },
  guidanceCard: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.border,
    borderWidth: 1,
    borderRadius: THEME.radius.lg,
    padding: 16,
    minHeight: 100,
    justifyContent: "center",
    gap: 10,
  },
  guidanceStack: {
    gap: 12,
  },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: THEME.radius.md,
    padding: 14,
    gap: 8,
  },
  actionCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: THEME.radius.md,
    padding: 14,
    gap: 10,
  },
  subsectionTitle: {
    color: THEME.colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  guidanceText: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 15,
    lineHeight: 23,
  },
  suggestionRow: {
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceMuted,
    borderRadius: THEME.radius.md,
    padding: 12,
    gap: 10,
  },
  doneButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: THEME.colors.accent,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: `${THEME.colors.accent}1F`,
  },
  doneButtonCompleted: {
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceMuted,
  },
  doneButtonText: {
    color: THEME.colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    fontWeight: "700",
  },
  doneButtonTextCompleted: {
    color: THEME.colors.textTertiary,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: THEME.colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    marginTop: 12,
  },
  errorText: {
    color: THEME.colors.danger,
    fontSize: 18,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: THEME.colors.surface,
    padding: 12,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  backButtonText: {
    color: THEME.colors.textPrimary,
  },
  pressedButton: {
    transform: [{ scale: 0.985 }],
  },
});
