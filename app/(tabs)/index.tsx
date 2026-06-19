import React, { useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import SafetyScoreBar from "../../src/components/SafetyScoreBar";
import FeatureSummaryCard from "../../src/components/FeatureSummaryCard";
import { THEME } from "../../src/constants/theme";

export default function HomeScreen() {
  const router = useRouter();
  const safetyScore = useDashboardStore((state) => state.SafetyScore);
  const activeBreachesCount = useDashboardStore((state) => state.activeBreachesCount);
  const scannedMessages = useDashboardStore((state) => state.scannedMessages);
  const protectedImagesCount = useDashboardStore((state) => state.protectedImagesCount);
  const suggestions = useDashboardStore((state) => state.suggestions);
  const lastUpdateTimestamp = useDashboardStore((state) => state.lastUpdateTimestamp);
  const flaggedMessagesScanCount = useMemo(
    () => scannedMessages.filter((message) => message.riskType !== "SAFE").length,
    [scannedMessages]
  );
  const pendingBreachActionsCount = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          suggestion.source === "breach" && !suggestion.isFallback && !suggestion.acted
      ).length,
    [suggestions]
  );
  const pendingBreachSourcesCount = useMemo(
    () =>
      new Set(
        suggestions
          .filter(
            (suggestion) =>
              suggestion.source === "breach" && !suggestion.isFallback && !suggestion.acted
          )
          .map((suggestion) => suggestion.sourceId)
      ).size,
    [suggestions]
  );
  const effectiveActiveBreachesCount = Math.max(
    activeBreachesCount,
    pendingBreachSourcesCount
  );
  const pendingScannerActionsCount = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          suggestion.source === "scan" && !suggestion.isFallback && !suggestion.acted
      ).length,
    [suggestions]
  );

  const timeAgo = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 60000);
    return diff < 1 ? "Just now" : `${diff} min ago`;
  };

  const formatPendingTagText = (count: number) =>
    `${count} ${count === 1 ? "Action" : "Actions"} Pending`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.appName}>ThreatLens</Text>
        <Text style={styles.tagline}>
          See risks. Act fast. Stay protected.
        </Text>
      </View>

      <SafetyScoreBar score={safetyScore} />

      <View style={styles.cardsContainer}>
        <FeatureSummaryCard
          title="Data Breaches"
          value={
            effectiveActiveBreachesCount === 0
              ? "All Clear"
              : `${effectiveActiveBreachesCount} Found`
          }
          icon="shield-off"
          statusColor={
            effectiveActiveBreachesCount === 0 ? "#4ADE80" : "#F87171"
          }
          badgeCount={effectiveActiveBreachesCount}
          timestampText={`Last checked: ${timeAgo(lastUpdateTimestamp)}`}
          pendingTagText={
            pendingBreachActionsCount > 0
              ? formatPendingTagText(pendingBreachActionsCount)
              : undefined
          }
          onPress={() => router.push("/(tabs)/breach")}
        />

        <FeatureSummaryCard
          title="Message Safety"
          value={`${flaggedMessagesScanCount} Flagged`}
          icon="message-square"
          statusColor={
            flaggedMessagesScanCount === 0 ? "#4ADE80" : "#FBBF24"
          }
          timestampText={`Last 30 days`}
          pendingTagText={
            pendingScannerActionsCount > 0
              ? formatPendingTagText(pendingScannerActionsCount)
              : undefined
          }
          onPress={() => router.push("/(tabs)/scanner")}
        />

        <FeatureSummaryCard
          title="Image Shield"
          value={`${protectedImagesCount} Protected`}
          icon="image"
          statusColor="#2A2D35" // Neutral outline
          timestampText={`Last 30 days`}
          onPress={() => router.push("/(tabs)/shield")}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 96,
  },
  header: {
    marginBottom: 4,
  },
  appName: {
  fontFamily: THEME.fontFamily.dmSans,
  fontSize: 32,
  fontWeight: "700",
  color: THEME.colors.textPrimary,
  letterSpacing: 0.5,
  },

  tagline: {
    marginTop: 6,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    color: THEME.colors.textSecondary,
    opacity: 0.8,
  },
  subheading: {
    marginTop: 4,
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
  },
  cardsContainer: {
    marginTop: 10,
    gap: 4,
  },
});