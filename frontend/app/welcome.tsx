import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import Scrim from "@/src/components/Scrim";
import { useAuth } from "@/src/context/AuthContext";
import { api, mediaUrl } from "@/src/lib/api";
import { colors, coverFor, fonts, logo as appLogo, spacing } from "@/src/theme";

type Coach = {
  name: string;
  brand_logo: string | null;
  coach_specialty: string | null;
  picture: string | null;
};

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ coach: Coach | null }>("/coach")
      .then((res) => setCoach(res.coach))
      .catch(() => setCoach(null));
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      await api("/me/welcomed", { method: "POST" });
      await refreshUser();
    } catch {
      // proceed anyway — the flag will retry next launch
    } finally {
      router.replace("/(tabs)");
    }
  };

  const brandLogo = mediaUrl(coach?.brand_logo);
  const firstName = (user?.name ?? "").split(" ")[0];

  return (
    <View style={styles.container}>
      <Image source={{ uri: coverFor("fitness") }} style={styles.bg} resizeMode="cover" />
      <View style={styles.tint} />
      <Scrim />
      <View style={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.logoWrap}>
          {brandLogo ? (
            <Image testID="coach-logo" source={{ uri: brandLogo }} style={styles.brandLogo} resizeMode="contain" />
          ) : (
            <Image source={appLogo} style={styles.brandLogo} resizeMode="contain" />
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.kicker}>
            {coach?.name ? `COACHED BY ${coach.name.toUpperCase()}` : "WELCOME"}
          </Text>
          <Text testID="welcome-title" style={styles.title}>
            {firstName ? `Welcome, ${firstName}.` : "Welcome."}
          </Text>
          <Text style={styles.sub}>
            {coach?.coach_specialty
              ? `Your ${coach.coach_specialty.toLowerCase()} coaching space is ready.`
              : "Your private coaching space is ready."}
          </Text>
        </View>

        <View style={styles.list}>
          <Line icon="today" text="Your training for today, one tap away" />
          <Line icon="school" text="Courses and lessons released as you go" />
          <Line icon="flag" text="Goals, milestones and check-ins in one place" />
          <Line icon="chatbubbles" text="Message your coach any time" />
        </View>

        <Button testID="welcome-start-btn" title="Let's begin" onPress={start} loading={busy} />
      </View>
    </View>
  );
}

function Line({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineIcon}>
        <Ionicons name={icon} size={16} color={colors.brand} />
      </View>
      <Text style={styles.lineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  bg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.55)" },
  content: { flex: 1, justifyContent: "space-between", padding: spacing.xl },
  logoWrap: { alignItems: "flex-start" },
  brandLogo: { width: 150, height: 60 },
  kicker: { fontFamily: fonts.bold, fontSize: 11, color: colors.brand, letterSpacing: 2 },
  title: { fontFamily: fonts.displayBold, fontSize: 38, lineHeight: 42, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.onSurfaceTertiary },
  list: { gap: spacing.md },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  lineIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  lineText: { flex: 1, fontFamily: fonts.medium, fontSize: 14.5, color: colors.onSurface },
});
