import Feather from "@expo/vector-icons/Feather";
import { withLayoutContext } from "expo-router";
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabNavigationEventMap,
  type MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import type { ParamListBase, TabNavigationState } from "@react-navigation/native";

import SwipeTabBar from "../../src/components/SwipeTabBar";
import { useTheme } from "../../src/hooks/useTheme";

const { Navigator } = createMaterialTopTabNavigator();

// The same file-based tab routes, shown in a pager so you can swipe between them.
const SwipeTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <SwipeTabs
      tabBarPosition="bottom"
      tabBar={(props) => <SwipeTabBar {...props} />}
      style={{ backgroundColor: colors.background }}
      screenOptions={{
        // Neighbouring tabs are ready before you swipe to them.
        lazy: true,
        lazyPreloadDistance: 1,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <SwipeTabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <SwipeTabs.Screen
        name="scanner"
        options={{
          title: "Scanner",
          tabBarIcon: ({ color }) => <Feather name="search" size={22} color={color} />,
        }}
      />
      <SwipeTabs.Screen
        name="shield"
        options={{
          title: "Shield",
          tabBarIcon: ({ color }) => <Feather name="image" size={22} color={color} />,
        }}
      />
      <SwipeTabs.Screen
        name="breach"
        options={{
          title: "Breaches",
          tabBarIcon: ({ color }) => <Feather name="shield-off" size={22} color={color} />,
        }}
      />
    </SwipeTabs>
  );
}
