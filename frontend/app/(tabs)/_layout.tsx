import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts } from "@/src/theme";

export default function TabsLayout() {
  const { user, loading } = useAuth();

  if (!loading && !user) {
    return <Redirect href="/login" />;
  }
  if (!loading && user && !user.role) {
    return <Redirect href="/role-select" />;
  }
  if (!loading && user?.role === "client" && !user.onboarding_completed) {
    return <Redirect href="/onboarding" />;
  }

  const isCoach = user?.role === "coach";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceSecondary,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: fonts.semiBold, fontSize: 11 },
      }}
      screenListeners={{
        tabPress: () => {
          if (Platform.OS !== "web") {
            Haptics.selectionAsync().catch(() => {});
          }
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isCoach ? "Home" : "Today",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={isCoach ? "home" : "today"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          href: isCoach ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: "Programs",
          href: isCoach ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          href: isCoach ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-sharp" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
