import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useBreachStore } from "../../src/stores/breachStore";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import { THEME } from "../../src/constants/theme";
import { makeStyles, useTheme } from "../../src/hooks/useTheme";
import SettingsButton from "../../src/components/settings/SettingsButton";
import BreachSettings from "../../src/components/breach/BreachSettings";
import { TAB_BAR_CLEARANCE } from "../../src/components/SwipeTabBar";

function parseStoredGuidance(value?: string): { actionItems: string[]; isFallback: boolean } | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { actionItems?: unknown }).actionItems)
    ) {
      return {
        actionItems: (parsed as { actionItems: unknown[] }).actionItems.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        ),
        isFallback: Boolean((parsed as { isFallback?: unknown }).isFallback),
      };
    }
  } catch {
    // Legacy non-JSON guidance strings imply no structured action items.
    return { actionItems: [], isFallback: false };
  }

  return null;
}

const ALL_FILTER = "__ALL__";
const BREACH_PAGE_SIZE = 10;
const AUTO_COLLAPSE_MS = 45_000;
const EMAIL_REGEX = /^[^\s@]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$/;

type BreachActionProgress = {
  totalSuggestions: number;
  actedSuggestions: number;
  ratio: number;
  isSecured: boolean;
  hasGuidance: boolean;
};

function validateCredentialInput(value: string): string | null {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("@")) {
    return EMAIL_REGEX.test(normalized)
      ? null
      : "Enter a valid email address";
  }

  return normalized.length >= 3
    ? null
    : "Username must be at least 3 characters";
}

function buildProgress(
  actedSuggestionsRaw: number,
  totalSuggestionsRaw: number,
  hasGuidance: boolean
): BreachActionProgress {
  const total = Math.max(0, totalSuggestionsRaw);
  const acted = Math.min(Math.max(0, actedSuggestionsRaw), total);
  const isSecured = hasGuidance && (total === 0 || acted === total);
  const ratio = total === 0 ? (isSecured ? 1 : 0) : acted / total;

  return {
    totalSuggestions: total,
    actedSuggestions: acted,
    ratio,
    isSecured,
    hasGuidance,
  };
}

export default function BreachScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const breachStore = useBreachStore();
  const suggestions = useDashboardStore((state) => state.suggestions);
  const getSuggestionsForSource = useDashboardStore((state) => state.getSuggestionsForSource);
  const [newEmail, setNewEmail] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [selectedCredentialFilter, setSelectedCredentialFilter] = useState<string>(ALL_FILTER);
  const [visibleCountByFilter, setVisibleCountByFilter] = useState<Record<string, number>>({});
  const collapseTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const credentialFilters = useMemo(
    () => breachStore.credentials.map((cred) => cred.value),
    [breachStore.credentials]
  );

  const filteredBreaches = useMemo(() => {
    if (selectedCredentialFilter === ALL_FILTER) {
      return breachStore.breaches;
    }
    return breachStore.breaches.filter(
      (breach) => breach.matchedCredential === selectedCredentialFilter
    );
  }, [breachStore.breaches, selectedCredentialFilter]);

  useEffect(() => {
    if (
      selectedCredentialFilter !== ALL_FILTER &&
      !credentialFilters.includes(selectedCredentialFilter)
    ) {
      setSelectedCredentialFilter(ALL_FILTER);
    }
  }, [credentialFilters, selectedCredentialFilter]);

  useEffect(() => {
    return () => {
      Object.values(collapseTimersRef.current).forEach((timer) => clearTimeout(timer));
      collapseTimersRef.current = {};
    };
  }, []);

  const clearCollapseTimer = (filterKey: string) => {
    const existing = collapseTimersRef.current[filterKey];
    if (existing) {
      clearTimeout(existing);
      delete collapseTimersRef.current[filterKey];
    }
  };

  const scheduleAutoCollapse = (filterKey: string) => {
    clearCollapseTimer(filterKey);
    collapseTimersRef.current[filterKey] = setTimeout(() => {
      setVisibleCountByFilter((prev) => {
        const current = prev[filterKey] ?? BREACH_PAGE_SIZE;
        if (current <= BREACH_PAGE_SIZE) {
          return prev;
        }

        return {
          ...prev,
          [filterKey]: BREACH_PAGE_SIZE,
        };
      });
    }, AUTO_COLLAPSE_MS);
  };

  const activeFilterKey = selectedCredentialFilter;
  const activeVisibleCount = visibleCountByFilter[activeFilterKey] ?? BREACH_PAGE_SIZE;
  const visibleBreaches = useMemo(
    () => filteredBreaches.slice(0, activeVisibleCount),
    [filteredBreaches, activeVisibleCount]
  );
  const hiddenBreachesCount = Math.max(filteredBreaches.length - visibleBreaches.length, 0);

  const breachProgressById = useMemo(() => {
    const progressById: Record<string, BreachActionProgress> = {};

    for (const breach of breachStore.breaches) {
      const storedGuidance = parseStoredGuidance(breach.aiGuidance);
      const hasGuidance = Boolean(storedGuidance);
      const requiredActionsCount =
        storedGuidance && !storedGuidance.isFallback ? storedGuidance.actionItems.length : 0;

      const breachSuggestions = getSuggestionsForSource("breach", breach.id);
      const actionableSuggestions = breachSuggestions.filter(
        (suggestion) => !suggestion.isFallback
      );

      progressById[breach.id] = buildProgress(
        actionableSuggestions.filter((suggestion) => suggestion.acted).length,
        hasGuidance ? requiredActionsCount : 0,
        hasGuidance
      );
    }

    return progressById;
  }, [breachStore.breaches, getSuggestionsForSource, suggestions]);

  const handleViewMoreBreaches = () => {
    setVisibleCountByFilter((prev) => {
      const current = prev[activeFilterKey] ?? BREACH_PAGE_SIZE;
      const next = Math.min(current + BREACH_PAGE_SIZE, filteredBreaches.length);

      return {
        ...prev,
        [activeFilterKey]: next,
      };
    });

    scheduleAutoCollapse(activeFilterKey);
  };

  const handleAddCredential = () => {
    const value = newEmail.trim();
    const validationError = validateCredentialInput(value);

    if (validationError) {
      setInputError(validationError);
      return;
    }

    if (!value) {
      return;
    }

    breachStore.addCredential(value, value.includes("@") ? "email" : "username");
    setNewEmail("");
    setInputError(null);
  };

  const handleCredentialInputChange = (value: string) => {
    setNewEmail(value);
    setInputError(validateCredentialInput(value));
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Data Breaches</Text>
        <SettingsButton title="Breach settings">
          <BreachSettings />
        </SettingsButton>
      </View>
      
      <View style={styles.addSection}>
        <TextInput
          style={[styles.input, inputError ? styles.inputErrorBorder : null]}
          placeholder="Email or username to watch"
          placeholderTextColor={colors.muted}
          value={newEmail}
          onChangeText={handleCredentialInputChange}
          autoCapitalize="none"
        />
        <Pressable style={styles.addButton} onPress={handleAddCredential}>
          <Feather name="plus" size={22} color={colors.onAccent} />
        </Pressable>
      </View>
      {inputError ? <Text style={styles.inputErrorText}>{inputError}</Text> : null}

      <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Watching</Text>
        </View>
        
        {breachStore.credentials.length === 0 ? (
          <Text style={styles.emptyText}>Not watching any accounts yet.</Text>
        ) : (
          breachStore.credentials.map((cred) => (
            <View key={cred.id} style={styles.credentialRow}>
              <Text style={styles.credentialText}>{cred.value}</Text>
              <Pressable onPress={() => breachStore.removeCredential(cred.id)}>
                <Feather name="trash-2" size={20} color={colors.statusBad} />
              </Pressable>
            </View>
          ))
        )}

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>Breaches</Text>
          <Pressable onPress={() => breachStore.runScan()} disabled={breachStore.isScanning}>
             {breachStore.isScanning ? (
                 <ActivityIndicator size="small" color={colors.accent} />
             ) : (
                 <Feather name="refresh-cw" size={20} color={colors.accent} />
             )}
          </Pressable>
        </View>

        {breachStore.credentials.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <Pressable
              onPress={() => setSelectedCredentialFilter(ALL_FILTER)}
              style={({ pressed }) => [
                styles.filterChip,
                selectedCredentialFilter === ALL_FILTER && styles.filterChipActive,
                pressed && styles.pressedButton,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCredentialFilter === ALL_FILTER && styles.filterChipTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>

            {credentialFilters.map((value) => {
              const isActive = selectedCredentialFilter === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setSelectedCredentialFilter(value)}
                  style={({ pressed }) => [styles.filterChip, isActive && styles.filterChipActive, pressed && styles.pressedButton]}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {filteredBreaches.length === 0 && !breachStore.isScanning ? (
          breachStore.scanError ? (
            <Text style={styles.errorText}>{breachStore.scanError}</Text>
          ) : (
            <Text style={styles.safeText}>
              {selectedCredentialFilter === ALL_FILTER
                ? "No breaches found."
                : `No breaches found for ${selectedCredentialFilter}.`}
            </Text>
          )
        ) : (
          visibleBreaches.map((breach) => (
            <Pressable 
              key={breach.id} 
              style={({ pressed }) => [
                styles.breachCard,
                breachProgressById[breach.id]?.isSecured && styles.breachCardResolved,
                pressed && styles.pressedButton,
              ]}
              onPress={() => router.push(`/breach/${breach.id}`)}
            >
              <View style={styles.breachHeader}>
                <Feather
                  name={breachProgressById[breach.id]?.isSecured ? "check-circle" : "alert-triangle"}
                  size={20}
                  color={breachProgressById[breach.id]?.isSecured ? colors.accent : colors.danger}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.breachName}>{breach.name}</Text>
              </View>
              <Text style={styles.breachDate}>Date: {new Date(breach.date).toLocaleDateString()}</Text>
              {!!breach.matchedCredential && (
                <Text style={styles.matchedCredentialText}>
                  Matched: {breach.matchedCredential}
                </Text>
              )}
              <Text style={styles.breachDataTypes}>
                Leaked: {breach.dataClasses.join(", ")}
              </Text>
              <Text
                style={[
                  styles.statusText,
                  breachProgressById[breach.id]?.isSecured
                    ? styles.securedLabel
                    : styles.riskLabel,
                ]}
              >
                {breachProgressById[breach.id]?.isSecured ? "Secured" : "At Risk"}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round((breachProgressById[breach.id]?.ratio ?? 0) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {breachProgressById[breach.id]?.hasGuidance
                  ? `${breachProgressById[breach.id]?.actedSuggestions ?? 0} of ${
                      breachProgressById[breach.id]?.totalSuggestions ?? 0
                    } actions completed`
                  : "Plan not ready yet"}
              </Text>
              <Text style={styles.tapToView}>See what to do ›</Text>
            </Pressable>
          ))
        )}

        {hiddenBreachesCount > 0 && (
          <View style={styles.viewMoreContainer}>
            <Text style={styles.remainingText}>
              Showing {visibleBreaches.length} of {filteredBreaches.length} latest breaches
            </Text>
            <Pressable style={styles.viewMoreButton} onPress={handleViewMoreBreaches}>
              <Text style={styles.viewMoreText}>
                View 10 more ({hiddenBreachesCount} remaining)
              </Text>
            </Pressable>
            <Text style={styles.autoCollapseHint}>
              Expanded list auto-collapses to latest 10 after 45 seconds.
            </Text>
          </View>
        )}
        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    paddingTop: 56,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: THEME.typography.h1,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
  },
  addSection: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    padding: 14,
    borderRadius: THEME.radius.md,
    fontFamily: THEME.fontFamily.dmSans,
  },
  addButton: {
    backgroundColor: colors.accent,
    width: 48,
    borderRadius: THEME.radius.md,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  inputErrorBorder: {
    borderColor: colors.danger,
  },
  inputErrorText: {
    color: colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    marginBottom: 12,
  },
  listContainer: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: THEME.typography.h2,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: THEME.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: `${colors.accent}88`,
    backgroundColor: `${colors.accent}22`,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
  },
  filterChipTextActive: {
    color: colors.accent,
  },
  credentialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: THEME.radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  credentialText: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 14,
  },
  emptyText: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontStyle: "italic",
    marginBottom: 16,
  },
  safeText: {
    color: colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    marginTop: 8,
  },
  errorText: {
    color: colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    marginTop: 8,
  },
  breachCard: {
    backgroundColor: colors.surface,
    borderColor: `${colors.danger}88`,
    borderWidth: 1,
    padding: 18,
    borderRadius: THEME.radius.md,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 15,
    elevation: 5,
  },
  breachCardResolved: {
    borderColor: `${colors.accent}88`,
    backgroundColor: `${colors.accent}14`,
  },
  breachHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  breachName: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 18,
    fontWeight: "700",
  },
  breachDate: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
    marginBottom: 4,
  },
  matchedCredentialText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
    marginBottom: 6,
  },
  breachDataTypes: {
    color: colors.warning,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    marginBottom: 10,
  },
  statusText: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  securedLabel: {
    color: colors.accent,
  },
  riskLabel: {
    color: colors.danger,
  },
  progressTrack: {
    height: 6,
    borderRadius: THEME.radius.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: {
    height: "100%",
    borderRadius: THEME.radius.pill,
    backgroundColor: colors.accent,
  },
  progressText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    marginBottom: 10,
  },
  tapToView: {
    color: colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  viewMoreContainer: {
    marginTop: 6,
    marginBottom: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: THEME.radius.md,
    backgroundColor: colors.surface,
  },
  remainingText: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
    marginBottom: 10,
  },
  viewMoreButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}22`,
  },
  viewMoreText: {
    color: colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    fontSize: 13,
  },
  autoCollapseHint: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 11,
    marginTop: 8,
  },
  pressedButton: {
    transform: [{ scale: 0.985 }],
  },
}));