import { AppRegistry } from "react-native";
import "expo-router/entry";

AppRegistry.registerHeadlessTask(
  "ThreatLensNotificationTask",
  () => require("./src/tasks/notificationTask").default
);
