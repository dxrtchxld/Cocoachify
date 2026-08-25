import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import Button from "@/src/components/Button";
import { colors, fonts, spacing } from "@/src/theme";

export default function CheckoutCancelled() {
  return (
    <View style={styles.container}>
      <Ionicons name="close-circle" size={72} color={colors.onSurfaceSecondary} />
      <Text style={styles.title}>Checkout cancelled</Text>
      <Text style={styles.sub}>No charge was made. You can try again anytime.</Text>
      <Button
        title="Back to the app"
        onPress={() => router.replace("/(tabs)")}
        variant="secondary"
        style={{ marginTop: spacing.xl, alignSelf: "stretch" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  title: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.onSurface, marginTop: spacing.lg },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
