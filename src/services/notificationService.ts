import * as Notifications from 'expo-notifications';
import { NativeModules, Platform } from 'react-native';

const THREAT_CHANNEL_ID = 'threat-alerts';

// Need to configure notification handler to show it when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async (): Promise<any> => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(THREAT_CHANNEL_ID, {
    name: 'Threat Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function requestNotificationPermissions() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  return finalStatus === 'granted';
}

export async function sendLocalNotification(title: string, body: string, data?: Record<string, unknown>) {
  if (Platform.OS === 'android') {
    const resultId = typeof data?.resultId === 'string' ? data.resultId : '';
    NativeModules.NotificationModule.showNotification(title, body, resultId);
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: null,
  });
}
