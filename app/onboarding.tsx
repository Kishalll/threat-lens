import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { makeStyles, useTheme } from "../src/hooks/useTheme";

export default function OnboardingScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");

  const nextStep = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      // Finish onboarding
      router.replace("/(tabs)/");
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View>
            <Text style={styles.title}>Notification Access</Text>
            <Text style={styles.body}>
              To automatically scan incoming messages for scams, ThreatLens needs Notification Listener permission.
            </Text>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Open System Settings</Text>
            </Pressable>
          </View>
        );
      case 2:
        return (
          <View>
            <Text style={styles.title}>Monitor Data Breaches</Text>
            <Text style={styles.body}>
              Enter an email address to continuously monitor for data breaches.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        );
      case 3:
        return (
          <View>
            <Text style={styles.title}>How it Works</Text>
            <Text style={styles.body}>
              • Breaches: We alert you if your data is leaked.{'\n'}
              • Scanner: AI classifies messages to detect scams.{'\n'}
              • Shield: We embed invisible watermarks to protect your photos.
            </Text>
          </View>
        );
      case 4:
        return (
          <View>
            <Text style={styles.title}>Optional Sync</Text>
            <Text style={styles.body}>
              ThreatLens is local-first by default. You can enable Firebase sync later if you want to access your data across devices.
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        {renderStepContent()}
      </View>
      <View style={styles.footer}>
        <View style={styles.pagination}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.dot, step === i && styles.activeDot]}
            />
          ))}
        </View>
        <Pressable style={styles.button} onPress={nextStep}>
          <Text style={styles.buttonText}>
            {step === 4 ? "Get Started" : "Next"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: "space-between",
  },
  contentContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: "DMSans-Regular",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 16,
  },
  body: {
    color: colors.muted,
    fontFamily: "DMSans-Regular",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.neutral,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.textPrimary,
    padding: 16,
    fontSize: 16,
    fontFamily: "DMSans-Regular",
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.statusGood,
    borderWidth: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.statusGood,
    fontFamily: "DMSans-Regular",
    fontSize: 16,
    fontWeight: "bold",
  },
  footer: {
    paddingBottom: 24,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neutral,
  },
  activeDot: {
    backgroundColor: colors.statusGood,
    width: 24,
  },
  button: {
    backgroundColor: colors.statusGood,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: colors.onAccent,
    fontFamily: "DMSans-Regular",
    fontSize: 16,
    fontWeight: "bold",
  },
}));
