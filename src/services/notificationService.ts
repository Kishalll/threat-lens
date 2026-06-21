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
    let deepLink = '';
    if (typeof data?.encodedResult === 'string' && data.encodedResult) {
      deepLink = `threatlens://scan/result?data=${encodeURIComponent(data.encodedResult)}`;
    } else if (data?.type === 'BREACH_ALERT') {
      const ids = Array.isArray(data.breachIds) ? data.breachIds : [];
      deepLink = ids.length === 1
        ? `threatlens://breach/${ids[0]}`
        : 'threatlens://breach';
    }
    NativeModules.NotificationModule.showNotification(title, body, deepLink);
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: null,
  });
}
