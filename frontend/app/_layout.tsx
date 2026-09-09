import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Alert, LogBox, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";

import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { ThemeProvider, useTheme } from "@/src/context/ThemeContext";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { registerForPush } from "@/src/lib/push";
import { colors } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

// 1. Foreground notification behavior — MODULE SCOPE, before any component.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// 2. Android notification channel — MODULE SCOPE, before any component.
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

const PUSH_NUDGE_KEY = "pushNudgeAt";

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "Oswald-Medium": require("../assets/fonts/Oswald-Medium.ttf"),
    "Oswald-SemiBold": require("../assets/fonts/Oswald-SemiBold.ttf"),
    "Oswald-Bold": require("../assets/fonts/Oswald-Bold.ttf"),
    "Manrope-Regular": require("../assets/fonts/Manrope-Regular.ttf"),
    "Manrope-Medium": require("../assets/fonts/Manrope-Medium.ttf"),
    "Manrope-SemiBold": require("../assets/fonts/Manrope-SemiBold.ttf"),
    "Manrope-Bold": require("../assets/fonts/Manrope-Bold.ttf"),
    "Anton-Regular": require("../assets/fonts/Anton-Regular.ttf"),
    "SpaceMono-Regular": require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  const router = useRouter();

  const ready = (iconsLoaded || !!iconsError) && (fontsLoaded || !!fontsError);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  // Push notification tap handling + denied-permission nudge. Runs once,
  // independent of auth state — a cold-start tap must work even before the
  // auth check resolves.
  useEffect(() => {
    if (Platform.OS === "web") return;

    const openFromData = (data: Record<string, any> | undefined) => {
      const url = data?.deeplink || data?.action_url;
      if (!url) return;
      if (typeof url === "string" && url.startsWith("http")) {
        Linking.openURL(url);
      } else if (typeof url === "string") {
        router.push(url as any);
      }
    };

    // 3. Warm tap — user taps the notification while the app is open.
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromData(response.notification.request.content.data);
    });

    // 4. Cold-start tap — user tapped a notification while the app was killed.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromData(response.notification.request.content.data);
    });

    // Denied-permission weekly nudge, deep-linking to system settings.
    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const lastNudge = await AsyncStorage.getItem(PUSH_NUDGE_KEY);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;

      Alert.alert(
        "Turn on notifications?",
        "Enable notifications in Settings so you never miss a message, booking update, or session reminder.",
        [
          {
            text: "Later",
            style: "cancel",
            onPress: () => AsyncStorage.setItem(PUSH_NUDGE_KEY, String(Date.now())),
          },
          {
            text: "Open Settings",
            onPress: () => {
              AsyncStorage.setItem(PUSH_NUDGE_KEY, String(Date.now()));
              Linking.openSettings();
            },
          },
        ],
      );
    })();

    return () => {
      tapSub.remove();
    };
  }, [router]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider>
            <ThemedApp />
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedApp() {
  useTheme();
  const { user } = useAuth();

  // (Re)register for push on every login / app open — device tokens rotate.
  useEffect(() => {
    if (user?.user_id) {
      registerForPush(user.user_id);
    }
  }, [user?.user_id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        <Stack.Screen name="role-select" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="invite" />
      </Stack>
    </View>
  );
}

