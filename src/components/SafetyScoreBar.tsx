import React, { useEffect, useRef } from "react";
import { View, Text, Animated } from "react-native";
import { scoreBand } from "../utils/scoreCalculator";
import { THEME } from "../constants/theme";
import { makeStyles, useTheme } from "../hooks/useTheme";

interface Props {
  score: number;
}

export default function SafetyScoreBar({ score }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const color = { good: colors.accent, warn: colors.warning, bad: colors.danger }[scoreBand(score)];
  const label = score >= 80 ? "Good" : score >= 50 ? "Needs a look" : "At risk";

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: score,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [score]);

  return (
    <View style={styles.container}>
      <View style={styles.scoreHero}>
        <Text style={styles.title}>Safety score</Text>
        <View style={styles.heroRow}>
          <Text style={[styles.scoreText, { color }]}>{score}</Text>
          <Text style={styles.outOfText}>/100</Text>
        </View>
        <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
      </View>
      <View style={styles.barBackground}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: color,
              width: animatedWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    marginTop: 8,
    marginBottom: 20,
    width: "100%",
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 9,
  },
  scoreHero: {
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  scoreText: {
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 42,
    fontWeight: "700",
    lineHeight: 46,
  },
  outOfText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 17,
    marginBottom: 4,
  },
  scoreLabel: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    marginTop: 4,
    fontWeight: "700",
  },
  barBackground: {
    height: 10,
    backgroundColor: colors.hairline,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
}));
