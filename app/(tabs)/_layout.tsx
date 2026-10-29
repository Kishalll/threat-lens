import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import {  } from "react-native";
import { THEME } from "../../src/constants/theme";
import { makeStyles, useTheme } from "../../src/hooks/useTheme";

export default function TabsLayout() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Scanner",
          tabBarIcon: ({ color, size }) => (
            <Feather name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shield"
        options={{
          title: "Shield",
          tabBarIcon: ({ color, size }) => (
            <Feather name="image" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="breach"
        options={{
          title: "Breaches",
          tabBarIcon: ({ color, size }) => (
            <Feather name="shield-off" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const useStyles = makeStyles((colors) => ({
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    height: 68,
    paddingTop: 8,
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
  tabBarLabel: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 3,
  },
  tabBarItem: {
    borderRadius: THEME.radius.md,
  },
}));