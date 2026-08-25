import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function RoleSelect() {
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();
  const [role, setRole] = useState<"coach" | "client" | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!role) return;
    setBusy(true);
    try {
      await api("/me/role", { method: "POST", body: { role } });
      await refreshUser();
      router.replace(role === "client" ? "/onboarding" : "/(tabs)");
    } catch {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <Text style={styles.kicker}>WELCOME TO CO-COACHIFY</Text>
      <Text style={styles.title}>HOW WILL YOU{"\n"}USE THE APP?</Text>
      <Text style={styles.sub}>You can invite clients or connect to a coach after this step.</Text>

      <TouchableOpacity
        testID="role-coach"
        style={[styles.card, role === "coach" && styles.cardActive]}
        activeOpacity={0.85}
        onPress={() => setRole("coach")}
      >
        <View style={styles.cardIcon}>
          <Ionicons name="clipboard" size={26} color={role === "coach" ? colors.brand : colors.onSurfaceSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>I&apos;m a Coach</Text>
          <Text style={styles.cardSub}>
            Build programs and sessions, invite clients, track their check-ins and progress.
          </Text>
        </View>
        {role === "coach" && <Ionicons name="checkmark-circle" size={24} color={colors.brand} />}
      </TouchableOpacity>

      <TouchableOpacity
        testID="role-client"
        style={[styles.card, role === "client" && styles.cardActive]}
        activeOpacity={0.85}
        onPress={() => setRole("client")}
      >
        <View style={styles.cardIcon}>
          <Ionicons name="barbell" size={26} color={role === "client" ? colors.brand : colors.onSurfaceSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>I&apos;m a Client</Text>
          <Text style={styles.cardSub}>
            Connect to your coach, follow your daily plan and log your check-ins.
          </Text>
        </View>
        {role === "client" && <Ionicons name="checkmark-circle" size={24} color={colors.brand} />}
      </TouchableOpacity>

      <View style={{ flex: 1 }} />
      <Button
        testID="confirm-role-btn"
        title="Continue"
        onPress={confirm}
        loading={busy}
        disabled={!role}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  kicker: { fontFamily: fonts.bold, fontSize: 12, color: colors.brandSecondary, letterSpacing: 2 },
  title: { fontFamily: fonts.displayBold, fontSize: 36, lineHeight: 42, color: colors.onSurface, marginTop: spacing.sm },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.onSurfaceSecondary, marginTop: spacing.sm, marginBottom: spacing.xxl },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    minHeight: 96,
  },
  cardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface },
  cardSub: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.onSurfaceSecondary, marginTop: 3 },
});
