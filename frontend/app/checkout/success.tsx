import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import Button from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

export default function CheckoutSuccess() {
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();
  const { refreshUser } = useAuth();
  const [state, setState] = useState<"checking" | "paid" | "pending" | "error">("checking");
  const attempts = useRef(0);

  useEffect(() => {
    if (!session_id) {
      setState("error");
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      attempts.current += 1;
      try {
        const s = await api<{ payment_status: string; status: string }>(
          `/checkout/status/${session_id}`,
        );
        if (cancelled) return;
        if (s.payment_status === "paid") {
          await refreshUser();
          setState("paid");
          return;
        }
        if (s.status === "expired") {
          setState("error");
          return;
        }
        if (attempts.current >= 6) {
          setState("pending");
          return;
        }
        setTimeout(poll, 2000);
      } catch {
        if (!cancelled) setState("error");
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [session_id, refreshUser]);

  return (
    <View style={styles.container}>
      {state === "checking" && (
        <>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.title}>Verifying payment...</Text>
          <Text style={styles.sub}>Hold tight, this only takes a moment.</Text>
        </>
      )}
      {state === "paid" && (
        <>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Text style={styles.title}>You&apos;re in!</Text>
          <Text style={styles.sub}>Payment confirmed. Your purchase is now unlocked.</Text>
          <Button
            testID="back-home-btn"
            title="Back to the app"
            onPress={() => router.replace("/(tabs)")}
            style={{ marginTop: spacing.xl, alignSelf: "stretch" }}
          />
        </>
      )}
      {state === "pending" && (
        <>
          <Ionicons name="time" size={72} color={colors.warning} />
          <Text style={styles.title}>Payment processing</Text>
          <Text style={styles.sub}>
            We haven&apos;t received confirmation yet. If you completed payment, access will unlock
            automatically.
          </Text>
          <Button
            title="Back to the app"
            onPress={() => router.replace("/(tabs)")}
            variant="secondary"
            style={{ marginTop: spacing.xl, alignSelf: "stretch" }}
          />
        </>
      )}
      {state === "error" && (
        <>
          <Ionicons name="alert-circle" size={72} color={colors.error} />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.sub}>We couldn&apos;t verify this payment session.</Text>
          <Button
            title="Back to the app"
            onPress={() => router.replace("/(tabs)")}
            variant="secondary"
            style={{ marginTop: spacing.xl, alignSelf: "stretch" }}
          />
        </>
      )}
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
    lineHeight: 20,
  },
});
