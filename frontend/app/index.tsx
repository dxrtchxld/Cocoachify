import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (!user.role) return <Redirect href="/role-select" />;
  if (user.role === "client" && !user.onboarding_completed) {
    return <Redirect href="/onboarding" />;
  }
  if (user.role === "client" && user.coach_id && !user.welcomed) {
    return <Redirect href="/welcome" />;
  }
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
