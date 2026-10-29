import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useScannerStore } from "../../src/stores/scannerStore";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import { THEME } from "../../src/constants/theme";
import { makeStyles, useTheme } from "../../src/hooks/useTheme";
import SettingsButton from "../../src/components/settings/SettingsButton";
import ScannerSettings from "../../src/components/scanner/ScannerSettings";

export default function ScannerScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { prefill } = useLocalSearchParams<{ prefill?: string | string[] }>();
  const scannerStore = useScannerStore();
  const suggestions = useDashboardStore((state) => state.suggestions);
  const [textToScan, setTextToScan] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastFailedInput, setLastFailedInput] = useState<string>("");

  const pendingActionsByScanId = useMemo(() => {
    const pendingById = new Map<string, number>();

    for (const suggestion of suggestions) {
      if (suggestion.source !== "scan" || suggestion.isFallback || suggestion.acted) {
        continue;
      }

      const current = pendingById.get(suggestion.sourceId) ?? 0;
      pendingById.set(suggestion.sourceId, current + 1);
    }

    return pendingById;
  }, [suggestions]);

  useEffect(() => {
    const rawPrefill = Array.isArray(prefill) ? prefill[0] : prefill;
    const normalizedPrefill = typeof rawPrefill === "string" ? rawPrefill.trim() : "";
    if (normalizedPrefill.length > 0) {
      setTextToScan(normalizedPrefill);
    }
  }, [prefill]);

  const handleScan = async (retryText?: string) => {
    const input = (retryText ?? textToScan).trim();
    if (input.length === 0) return;

    setScanError(null);

    console.log("[SCAN] 1. manual scan started", { input });

    try {
        console.log("[SCAN] 2. calling scan service");

      const result = await scannerStore.scanManualText(input);

        console.log("[SCAN] 3. scan service returned", result);


      if (result.classification === "UNAVAILABLE") {
        setLastFailedInput(input);
        setScanError(
          result.explanation.trim().length > 0
            ? result.explanation
            : "AI quota exceeded or temporarily unavailable. Please try again."
        );
        return;
      }
        console.log("[SCAN] 4. processing result");


      setLastFailedInput("");
      setTextToScan("");
      router.push({ pathname: "/scan/result", params: { id: result.id } });

        console.log("[SCAN] 5. scan completed");

    } catch (error) {
        console.error("[SCAN] ERROR", error);

      if (error instanceof Error && error.message === "Scan cancelled.") {
        return;
      }

      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Message analysis failed. Please try again.";
      setScanError(message);
      setLastFailedInput(input);
    }
  };

  const getStatusColor = (classification: string) => {
    switch (classification) {
      case "SAFE": return colors.accent;
      case "PROMO": return colors.promo;
      case "SCAM": return colors.danger;
      case "PHISHING": return colors.danger;
      case "UNAVAILABLE": return colors.textTertiary;
      default: return colors.textTertiary;
    }
  };

  const getStatusIcon = (classification: string) => {
    switch (classification) {
      case "SAFE": return "shield";
      case "PROMO": return "tag";
      case "SCAM": return "alert-triangle";
      case "PHISHING": return "alert-octagon";
      case "UNAVAILABLE": return "slash";
      default: return "help-circle";
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Message Scanner</Text>
        <SettingsButton title="Scanner settings">
          <ScannerSettings />
        </SettingsButton>
      </View>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          multiline
          numberOfLines={6}
          placeholder="Paste or type a message, email, or link here to analyze it for scams or phishing..."
          placeholderTextColor={colors.muted}
          value={textToScan}
          onChangeText={setTextToScan}
          textAlignVertical="top"
        />
        <Pressable 
          style={({ pressed }) => [
            styles.scanButton,
            (textToScan.trim().length === 0 || scannerStore.isScanning) && styles.disabledButton,
            pressed && styles.pressedButton,
          ]}
          onPress={() => {
            void handleScan();
          }}
          disabled={textToScan.trim().length === 0 || scannerStore.isScanning}
        >
          {scannerStore.isScanning ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.scanButtonText}>Analyze Message</Text>
          )}
        </Pressable>

        {scannerStore.isScanning ? (
          <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.pressedButton]} onPress={scannerStore.cancelScan}>
            <Feather name="x-circle" size={18} color={colors.danger} />
            <Text style={styles.cancelButtonText}>Cancel Scan</Text>
          </Pressable>
        ) : null}

        {scanError ? <Text style={styles.errorText}>{scanError}</Text> : null}
        {scanError && lastFailedInput && !scannerStore.isScanning ? (
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressedButton]}
            onPress={() => {
              void handleScan(lastFailedInput);
            }}
          >
            <Feather name="rotate-ccw" size={16} color={colors.textPrimary} />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Scan History</Text>
      
      {scannerStore.history.length === 0 ? (
        <Text style={styles.emptyText}>No manual scans yet. Paste a message above.</Text>
      ) : (
        <ScrollView style={styles.historyList}>
          {scannerStore.history.map((record, index) => {
            const statusColor = getStatusColor(record.classification);
            const pendingActions = pendingActionsByScanId.get(record.id) ?? 0;
            return (
              <Pressable 
                key={record.id} 
                style={({ pressed }) => [styles.historyCard, index === 0 && { marginTop: 8 }, pressed && styles.pressedButton]}
                onPress={() => router.push({ pathname: "/scan/result", params: { id: record.id } })}
              >
                <View style={styles.historyHeader}>
                   <View style={styles.historyTitleRow}>
                     <Feather name={getStatusIcon(record.classification)} size={16} color={statusColor} />
                     <Text style={[styles.historyClassification, { color: statusColor }]}>
                       {record.classification} ({record.confidence}%)
                     </Text>
                     {pendingActions > 0 ? (
                       <View style={styles.pendingTag}>
                         <Text style={styles.pendingTagText}>
                           {pendingActions} pending action{pendingActions === 1 ? "" : "s"}
                         </Text>
                       </View>
                     ) : null}
                   </View>
                   <Text style={styles.timestamp}>{new Date(record.timestamp).toLocaleTimeString()}</Text>
                </View>
                <Text style={styles.previewText} numberOfLines={2}>{record.messagePreview}</Text>
              </Pressable>
            );
          })}
          <View style={{height: 20}} />
        </ScrollView>
      )}
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
  inputContainer: {
    marginBottom: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: THEME.radius.lg,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6,
  },
  textInput: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.border,
    borderWidth: 1,
    color: colors.textPrimary,
    padding: 16,
    borderRadius: THEME.radius.md,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
    minHeight: 120,
    marginBottom: 16,
  },
  scanButton: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: THEME.radius.md,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 5,
  },
  // No shadow when disabled: it shows through the see-through fill as a box.
  disabledButton: {
    backgroundColor: `${colors.accent}73`,
    elevation: 0,
    shadowOpacity: 0,
  },
  scanButtonText: {
    color: colors.onAccent,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  cancelButton: {
    marginTop: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: THEME.radius.md,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  cancelButtonText: {
    color: colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: THEME.typography.h2,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    marginBottom: 12,
  },
  historyList: {
    flex: 1,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: THEME.radius.md,
    padding: 16,
    marginBottom: 12,
    flexDirection: "column",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  historyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyClassification: {
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontWeight: "700",
    fontSize: 14,
  },
  timestamp: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 10,
  },
  pendingTag: {
    borderWidth: 1,
    borderColor: `${colors.warning}99`,
    backgroundColor: `${colors.warning}22`,
    borderRadius: THEME.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingTagText: {
    color: colors.warning,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 10,
    fontWeight: "700",
  },
  previewText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    lineHeight: 21,
  },
  emptyText: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontStyle: "italic",
  },
  errorText: {
    color: colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    marginTop: 10,
  },
  retryButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryButtonText: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    fontWeight: "700",
  },
  pressedButton: {
    transform: [{ scale: 0.985 }],
  },
}));