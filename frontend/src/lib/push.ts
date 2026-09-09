import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { BACKEND_URL } from "./api";

/** Request permission + register this device's native push token with the
 * backend. Never throws — a denial or network hiccup just means no push,
 * the rest of the app keeps working. Call on login and on every app open. */
export async function registerForPush(userId: string | null | undefined): Promise<void> {
  if (Platform.OS === "web" || !userId) return;
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    let finalStatus = status;
    if (status !== "granted" && canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      finalStatus = req.status;
    }
    if (finalStatus !== "granted") return;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${BACKEND_URL}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        platform: Platform.OS,
        device_token: tokenResp.data,
      }),
    });
  } catch (e) {
    console.warn("Push registration skipped:", e);
  }
}
