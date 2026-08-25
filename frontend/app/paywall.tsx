import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";
import { api, BACKEND_URL } from "@/src/lib/api";
import { colors, fonts, images, radius, spacing } from "@/src/theme";

const FEATURES = [
  { icon: "barbell", text: "Unlock every premium program, including Rowing Strength" },
  { icon: "trending-up", text: "Full progress analytics — weight, RPE and volume trends" },
  { icon: "people", text: "Unlimited client connections for coaches" },
  { icon: "sparkles", text: "Early access to new coaching sessions every month" },
] as const;

export default function Paywall() {
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const originUrl =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.origin
      : BACKEND_URL;

  const buy = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await api<{ checkout_url: string; session_id: string }>("/checkout/session", {
        method: "POST",
        body: { purchase_type: "subscription", origin_url: originUrl },
      });
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.assign(res.checkout_url);
        return;
      }
      await WebBrowser.openBrowserAsync(res.checkout_url);
      // After the browser is dismissed, poll payment status a few times
      setStatus("Checking payment status...");
      for (let i = 0; i < 5; i++) {
        const s = await api<{ payment_status: string }>(`/checkout/status/${res.session_id}`);
        if (s.payment_status === "paid") {
          await refreshUser();
          setStatus("Payment successful! Premium unlocked.");
          setTimeout(() => router.back(), 1200);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setStatus("Payment not confirmed yet. If you paid, it will unlock shortly.");
    } catch (e: any) {
      setStatus(e?.message || "Purchase failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={{ uri: images.premiumHero }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(18,18,20,0.55)", "rgba(18,18,20,0.85)", colors.surface]}
        style={StyleSheet.absoluteFill}
      />
      <TouchableOpacity
        testID="close-paywall-btn"
        onPress={() => router.back()}
        style={[styles.closeBtn, { top: insets.top + spacing.sm }]}
      >
        <Ionicons name="close" size={24} color={colors.onSurface} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 120 }]}>
        <Text style={styles.kicker}>CO-COACHIFY PREMIUM</Text>
        <Text style={styles.headline}>TRAIN{"\n"}WITHOUT{"\n"}LIMITS</Text>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.icon} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon as any} size={18} color={colors.brand} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {status && <Text style={styles.status}>{status}</Text>}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          testID="subscribe-btn"
          title="Unlock Premium · $9.99"
          onPress={buy}
          loading={busy}
          disabled={busy}
        />
        <Text style={styles.smallPrint}>Secure checkout powered by Stripe. Test mode.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  closeBtn: {
    position: "absolute",
    right: spacing.lg,
    zIndex: 5,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(28,28,30,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 220 },
  kicker: { fontFamily: fonts.bold, fontSize: 12, color: colors.brandSecondary, letterSpacing: 2 },
  headline: {
    fontFamily: fonts.displayBold,
    fontSize: 52,
    lineHeight: 56,
    color: colors.onSurface,
    marginTop: spacing.sm,
  },
  features: { marginTop: spacing.xxl, gap: spacing.lg },
  featureRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20 },
  status: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.warning,
    marginTop: spacing.xl,
    textAlign: "center",
  },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  smallPrint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
