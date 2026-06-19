import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useScannerStore } from "../../src/stores/scannerStore";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import { THEME } from "../../src/constants/theme";

export default function ScannerScreen() {
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

    try {
      const result = await scannerStore.scanManualText(input);

      if (result.classification === "UNAVAILABLE") {
        setLastFailedInput(input);
        setScanError(
          result.explanation.trim().length > 0
            ? result.explanation
            : "AI quota exceeded or temporarily unavailable. Please try again."
        );
        return;
      }

      setLastFailedInput("");
      setTextToScan("");
      router.push({ pathname: "/scan/result", params: { id: result.id } });
    } catch (error) {
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
      case "SAFE": return THEME.colors.accent;
      case "PROMO": return "#7BA7D0";
      case "SPAM": return THEME.colors.warning;
      case "SCAM": return THEME.colors.danger;
      case "PHISHING": return THEME.colors.danger;
      case "UNAVAILABLE": return THEME.colors.textTertiary;
      default: return THEME.colors.textTertiary;
    }
  };

  const getStatusIcon = (classification: string) => {
    switch (classification) {
      case "SAFE": return "shield";
      case "PROMO": return "tag";
      case "SPAM": return "info";
      case "SCAM": return "alert-triangle";
      case "PHISHING": return "alert-octagon";
      case "UNAVAILABLE": return "slash";
      default: return "help-circle";
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Message Scanner</Text>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          multiline
          numberOfLines={6}
          placeholder="Paste or type a message, email, or link here to analyze it for scams or phishing..."
          placeholderTextColor="#8B8F99"
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
            <ActivityIndicator color="#0E0F11" />
          ) : (
            <Text style={styles.scanButtonText}>Analyze Message</Text>
          )}
        </Pressable>

        {scannerStore.isScanning ? (
          <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.pressedButton]} onPress={scannerStore.cancelScan}>
            <Feather name="x-circle" size={18} color={THEME.colors.danger} />
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
            <Feather name="rotate-ccw" size={16} color={THEME.colors.textPrimary} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    padding: 20,
    paddingTop: 56,
  },
  headerTitle: {
    color: THEME.colors.textPrimary,
    fontSize: THEME.typography.h1,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    marginBottom: 18,
  },
  inputContainer: {
    marginBottom: 22,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.lg,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6,
  },
  textInput: {
    backgroundColor: "rgba(10, 14, 22, 0.68)",
    borderColor: THEME.colors.border,
    borderWidth: 1,
    color: THEME.colors.textPrimary,
    padding: 16,
    borderRadius: THEME.radius.md,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
    minHeight: 120,
    marginBottom: 16,
  },
  scanButton: {
    backgroundColor: THEME.colors.accent,
    padding: 16,
    borderRadius: THEME.radius.md,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 5,
  },
  disabledButton: {
    backgroundColor: "rgba(131,208,174,0.45)",
  },
  scanButtonText: {
    color: "#0A0F14",
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  cancelButton: {
    marginTop: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: THEME.colors.danger,
    borderRadius: THEME.radius.md,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  cancelButtonText: {
    color: THEME.colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionTitle: {
    color: THEME.colors.textPrimary,
    fontSize: THEME.typography.h2,
    fontFamily: THEME.fontFamily.dmSans,
    fontWeight: "700",
    marginBottom: 12,
  },
  historyList: {
    flex: 1,
  },
  historyCard: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
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
    color: THEME.colors.textTertiary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 10,
  },
  pendingTag: {
    borderWidth: 1,
    borderColor: `${THEME.colors.warning}99`,
    backgroundColor: `${THEME.colors.warning}22`,
    borderRadius: THEME.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingTagText: {
    color: THEME.colors.warning,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 10,
    fontWeight: "700",
  },
  previewText: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    lineHeight: 21,
  },
  emptyText: {
    color: THEME.colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontStyle: "italic",
  },
  errorText: {
    color: THEME.colors.danger,
    fontFamily: THEME.fontFamily.dmSans,
    marginTop: 10,
  },
  retryButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: THEME.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryButtonText: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    fontWeight: "700",
  },
  pressedButton: {
    transform: [{ scale: 0.985 }],
  },
});