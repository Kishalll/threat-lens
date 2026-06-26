import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";

import type { VerificationResult } from "../../types/imageTrust";
import { THEME } from "../../constants/theme";

interface VerifyPanelProps {
  styles: any;
  verifySourceUri: string | null;
  verifyResult: VerificationResult | null;
  verifyLoading: boolean;
  verifyCloudCheck: boolean;
  statusMeta: Record<string, { label: string; color: string; icon: React.ComponentProps<typeof Feather>["name"] }>;
  onReset: () => void;
  onPickImage: () => void;
  onVerify: () => void;
  onToggleCloudCheck: (value: boolean) => void;
}

export default function VerifyPanel({
  styles,
  verifySourceUri,
  verifyResult,
  verifyLoading,
  verifyCloudCheck,
  statusMeta,
  onReset,
  onPickImage,
  onVerify,
  onToggleCloudCheck,
}: VerifyPanelProps) {
  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        {verifySourceUri ? (
          <Image source={{ uri: verifySourceUri }} style={styles.imageBox} />
        ) : (
          <View style={[styles.imageBox, styles.placeholderBox]}>
            <Feather name="search" size={44} color={THEME.colors.textTertiary} />
            <Text style={styles.placeholderText}>Select an image to verify</Text>
          </View>
        )}
        {verifySourceUri && (
          <TouchableOpacity style={styles.clearButton} onPress={onReset}>
            <Feather name="x" size={20} color={THEME.colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Cloud revocation check</Text>
        <Switch
          value={verifyCloudCheck}
          onValueChange={onToggleCloudCheck}
          thumbColor={verifyCloudCheck ? THEME.colors.accent : "#B8BDC6"}
          trackColor={{ false: "#4A5160", true: "#2B7A5A" }}
        />
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}
          onPress={onPickImage}
        >
          <Feather name="upload" size={18} color={THEME.colors.textPrimary} />
          <Text style={styles.secondaryButtonText}>Select</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            (!verifySourceUri || verifyLoading) && styles.disabledButton,
            pressed && styles.pressedButton,
          ]}
          disabled={!verifySourceUri || verifyLoading}
          onPress={onVerify}
        >
          {verifyLoading ? (
            <ActivityIndicator size="small" color="#0A0F14" />
          ) : (
            <>
              <Feather name="check-square" size={18} color="#0A0F14" />
              <Text style={styles.primaryButtonText}>Verify</Text>
            </>
          )}
        </Pressable>
      </View>

      {verifyResult ? (
        <View style={styles.resultCard}>
          <View style={styles.statusHeader}>
            <Feather
              name={statusMeta[verifyResult.status].icon}
              size={20}
              color={statusMeta[verifyResult.status].color}
            />
            <Text
              style={[
                styles.statusTitle,
                { color: statusMeta[verifyResult.status].color },
              ]}
            >
              {statusMeta[verifyResult.status].label}
            </Text>
          </View>
          <Text style={styles.resultLine}>{verifyResult.summary}</Text>
          <Text style={styles.resultLine}>
            Hash check: <Text style={{ color: verifyResult.checks.hashCheck ? THEME.colors.accent : THEME.colors.danger }}>{verifyResult.checks.hashCheck ? "PASS" : "FAIL"}</Text>
          </Text>
          <Text style={styles.resultLine}>
            Signature check: <Text style={{ color: verifyResult.checks.signatureCheck ? THEME.colors.accent : THEME.colors.danger }}>{verifyResult.checks.signatureCheck ? "PASS" : "FAIL"}</Text>
          </Text>
          <Text style={styles.resultLine}>
            Master cert check: <Text style={{ color: verifyResult.checks.masterCertCheck ? THEME.colors.accent : THEME.colors.danger }}>{verifyResult.checks.masterCertCheck ? "PASS" : "FAIL"}</Text>
          </Text>
          <Text style={styles.resultLine}>
            Cloud check: <Text style={{ color: verifyResult.checks.cloudCheck === "passed" ? THEME.colors.accent : verifyResult.checks.cloudCheck === "failed" ? THEME.colors.danger : verifyResult.checks.cloudCheck === "offline" ? THEME.colors.warning : THEME.colors.textTertiary }}>{verifyResult.checks.cloudCheck.toUpperCase()}</Text>
          </Text>
          {typeof verifyResult.pHashDistance === "number" ? (
            <Text style={styles.resultLine}>pHash distance: <Text style={{ color: verifyResult.pHashDistance <= 8 ? THEME.colors.accent : THEME.colors.danger }}>{verifyResult.pHashDistance}</Text></Text>
          ) : null}
          {verifyResult.details.map((detail) => (
            <Text key={detail} style={styles.detailLine}>
              • {detail}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
