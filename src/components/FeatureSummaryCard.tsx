import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { THEME } from "../constants/theme";
import { makeStyles, useTheme } from "../hooks/useTheme";

interface Props {
  title: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
  statusColor: string;
  onPress: () => void;
  timestampText?: string;
  badgeCount?: number;
  pendingTagText?: string;
}

export default function FeatureSummaryCard({
  title,
  value,
  icon,
  statusColor,
  onPress,
  timestampText,
  badgeCount,
  pendingTagText,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }],
      }}
    >
      <Pressable
        style={({ pressed }) => [
          styles.card,
          {
            borderColor:
              statusColor !== colors.neutral
                ? `${statusColor}66`
                : colors.border,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
        onPress={onPress}
      >
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconBadge, { backgroundColor: `${statusColor}20` }]}>
              <Feather name={icon} size={16} color={statusColor} />
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>
          <View style={styles.valueContainer}>
            <Text style={styles.value}>{value}</Text>
            {badgeCount !== undefined && badgeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeCount}</Text>
              </View>
            )}
          </View>
        </View>

        {timestampText ? (
          <View style={styles.footer}>
            <Text style={styles.timestamp}>{timestampText}</Text>
            {pendingTagText ? (
              <View style={styles.pendingTag}>
                <Text style={styles.pendingTagText}>{pendingTagText}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    borderWidth: 1,
    borderRadius: THEME.radius.md,
    padding: 18,
    marginBottom: 14,
    width: "100%",
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 7,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: THEME.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  valueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  value: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 16,
  },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: THEME.radius.pill,
    minWidth: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: THEME.fontFamily.jetbrainsMono,
  },
  footer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timestamp: {
    color: colors.textTertiary,
    fontSize: 12,
    fontFamily: THEME.fontFamily.dmSans,
  },
  pendingTag: {
    borderWidth: 1,
    borderColor: `${colors.warning}99`,
    backgroundColor: `${colors.warning}22`,
    borderRadius: THEME.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingTagText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: THEME.fontFamily.dmSans,
  },
}));
