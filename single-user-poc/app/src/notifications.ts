import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type WakeHandler = () => void;

export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS !== "ios") return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: false,
        allowAnnouncements: false,
      },
    });
    status = req.status;
  }
  if (status !== "granted") return null;

  const token = await Notifications.getDevicePushTokenAsync();
  return token.data;
}

export function subscribeWake(onWake: WakeHandler): () => void {
  const sub = Notifications.addNotificationReceivedListener((n) => {
    const data = n.request.content.data as Record<string, unknown> | undefined;
    if (data?.action === "wake" || data?.["content-available"] === 1) {
      onWake();
    }
  });
  const tapSub = Notifications.addNotificationResponseReceivedListener(() => {
    onWake();
  });
  return () => {
    sub.remove();
    tapSub.remove();
  };
}
