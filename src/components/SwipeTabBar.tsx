import React, { useRef, useState } from "react";
import { Animated, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import type { MaterialTopTabBarProps } from "@react-navigation/material-top-tabs";

import { THEME } from "../constants/theme";
import { makeStyles, useTheme } from "../hooks/useTheme";
import BusyBanner from "./BusyBanner";

const BAR_PADDING = 6;

// Space a scrolling tab screen should leave at the bottom so its last item
// clears the floating bar (68 high, 14 from the bottom) with some room to spare.
export const TAB_BAR_CLEARANCE = 96;

// Floating bottom bar for the swipeable tabs. Everything here is driven by the
// pager's live position, so it moves with your finger: the pill stretches like a
// blob between tabs, and icons grow, lift and change colour as you arrive.
// Only transforms and opacity are animated, because the position may be driven
// on the native thread, where colours can't be animated directly.
export default function SwipeTabBar({ state, descriptors, navigation, position }: MaterialTopTabBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [itemWidth, setItemWidth] = useState(0);
  const bounces = useRef<Record<string, Animated.Value>>({}).current;
  const count = state.routes.length;

  const onLayout = (event: LayoutChangeEvent) => {
    setItemWidth((event.nativeEvent.layout.width - BAR_PADDING * 2) / count);
  };

  const indexes = state.routes.map((_, i) => i);
  // Halfway points between tabs, where the pill is most stretched.
  const halfSteps = indexes.flatMap((i) => (i < count - 1 ? [i, i + 0.5] : [i]));
  const atHalf = (rest: number, stretched: number) =>
    halfSteps.map((step) => (Number.isInteger(step) ? rest : stretched));

  const pillMoves =
    count > 1
      ? {
          translateX: position.interpolate({ inputRange: indexes, outputRange: indexes.map((i) => i * itemWidth) }),
          scaleX: position.interpolate({ inputRange: halfSteps, outputRange: atHalf(1, 1.4) }),
          scaleY: position.interpolate({ inputRange: halfSteps, outputRange: atHalf(1, 0.82) }),
        }
      : { translateX: 0, scaleX: 1, scaleY: 1 };

  const bounceFor = (key: string) => {
    if (!bounces[key]) bounces[key] = new Animated.Value(1);
    return bounces[key];
  };

  return (
    <>
      <BusyBanner />
      <View style={styles.bar} onLayout={onLayout}>
        {itemWidth > 0 ? (
          <Animated.View
            style={[
              styles.pill,
              {
                width: itemWidth,
                transform: [
                  { translateX: pillMoves.translateX },
                  { scaleX: pillMoves.scaleX },
                  { scaleY: pillMoves.scaleY },
                ],
              },
            ]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = typeof options.title === "string" ? options.title : route.name;

          // 0 when far from this tab, 1 when it is the one showing.
          const arrival =
            count > 1
              ? position.interpolate({
                  inputRange: [index - 1, index, index + 1],
                  outputRange: [0, 1, 0],
                  extrapolate: "clamp",
                })
              : new Animated.Value(1);
          const grow = arrival.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
          const lift = arrival.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
          const leave = arrival.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
          const bounce = bounceFor(route.key);

          const onPress = () => {
            Animated.sequence([
              Animated.timing(bounce, { toValue: 0.8, duration: 90, useNativeDriver: true }),
              Animated.spring(bounce, { toValue: 1, friction: 3, tension: 170, useNativeDriver: true }),
            ]).start();
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              style={styles.item}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
            >
              <Animated.View style={{ transform: [{ scale: bounce }] }}>
                <Animated.View style={{ transform: [{ translateY: lift }, { scale: grow }] }}>
                  <Animated.View style={{ opacity: leave }}>
                    {options.tabBarIcon?.({ focused: false, color: colors.textTertiary })}
                  </Animated.View>
                  <Animated.View style={[styles.overlay, { opacity: arrival }]}>
                    {options.tabBarIcon?.({ focused: true, color: colors.accent })}
                  </Animated.View>
                </Animated.View>
              </Animated.View>
              <View importantForAccessibility="no-hide-descendants">
                <Animated.Text style={[styles.label, { color: colors.textTertiary, opacity: leave }]}>{label}</Animated.Text>
                <Animated.Text style={[styles.label, styles.overlay, { color: colors.accent, opacity: arrival }]}>
                  {label}
                </Animated.Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    height: 68,
    flexDirection: "row",
    padding: BAR_PADDING,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderRadius: THEME.radius.lg,
    backgroundColor: colors.surfaceMuted,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  pill: {
    position: "absolute",
    top: BAR_PADDING,
    bottom: BAR_PADDING,
    left: BAR_PADDING,
    borderRadius: THEME.radius.md,
    backgroundColor: `${colors.accent}1F`,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    textAlign: "center",
  },
  label: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 11,
    fontWeight: "600",
  },
}));
