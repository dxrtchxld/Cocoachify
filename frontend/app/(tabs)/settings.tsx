import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { useAuth, User } from "@/src/context/AuthContext";
import { ACCENTS, useTheme } from "@/src/context/ThemeContext";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  const { accentColor, setAccent } = useTheme();
  const isCoach = user?.role === "coach";
  const [coach, setCoach] = useState<User | null>(null);
  const [connectMode, setConnectMode] = useState<"code" | "email">("code");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [clientCount, setClientCount] = useState(0);

  const load = useCallback(async () => {
    try {
      if (isCoach) {
        const clients = await api<User[]>("/coach/clients");
        setClientCount(clients.length);
      } else {
        const c = await api<{ coach: User | null }>("/coach");
        setCoach(c.coach);
      }
      await refreshUser();
    } catch {
      // ignore
    }
  }, [isCoach, refreshUser]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const connect = async () => {
    const body =
      connectMode === "code" ? { code: code.trim() } : { coach_email: email.trim() };
    if (connectMode === "code" && !code.trim()) return;
    if (connectMode === "email" && !email.trim()) return;
    setJoining(true);
    setJoinMsg(null);
    try {
      const res = await api<{ coach: { name: string } }>("/invites/accept", {
        method: "POST",
        body,
      });
      setJoinMsg(`Connected to coach ${res.coach.name}!`);
      setCode("");
      setEmail("");
      await load();
    } catch (e: any) {
      setJoinMsg(e?.message || "Couldn't connect");
    } finally {
      setJoining(false);
    }
  };

  const confirmLogout = () => {
    const doLogout = async () => {
      await logout();
      router.replace("/login");
    };
    if (Platform.OS === "web") {
      doLogout();
    } else {
      Alert.alert("Log out", "Are you sure you want to log out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: doLogout },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>SETTINGS</Text>

        {/* Profile */}
        <View style={styles.profileCard}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{(user?.name || "U")[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <Text style={styles.roleText}>{isCoach ? "COACH" : "CLIENT"}</Text>
          </View>
          {user?.is_premium && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={12} color={colors.onBrandTertiary} />
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
          )}
        </View>

        {isCoach ? (
          <>
            <Text style={styles.sectionTitle}>COACHING</Text>
            <View style={styles.swatchCard}>
              <Text style={styles.rowTitle}>What kind of coach are you?</Text>
              <Text style={styles.rowSub}>This shapes your dashboard language and defaults.</Text>
              <View style={styles.specRow}>
                {[
                  { id: "fitness", label: "💪 Fitness" },
                  { id: "yoga", label: "🧘 Yoga" },
                  { id: "breathwork", label: "🌬️ Breathwork" },
                  { id: "mobility", label: "🤸 Mobility" },
                  { id: "mindfulness", label: "🌿 Mindfulness" },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    testID={`spec-${s.id}`}
                    style={[
                      styles.specChip,
                      user?.coach_specialty === s.id && { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
                    ]}
                    onPress={async () => {
                      try {
                        await api("/me/role", { method: "POST", body: { role: "coach", specialty: s.id } });
                        await refreshUser();
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.specText,
                        user?.coach_specialty === s.id && { color: colors.onSurface },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              testID="invite-client-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/invite")}
            >
              <Ionicons name="qr-code" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Invite a client</Text>
                <Text style={styles.rowSub}>Share your QR code or 6-character invite code</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="my-clients-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/(tabs)/clients")}
            >
              <Ionicons name="people" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>My clients</Text>
                <Text style={styles.rowSub}>
                  {clientCount} connected client{clientCount === 1 ? "" : "s"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <View style={styles.row}>
              <Ionicons name="mail" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Clients can also connect by email</Text>
                <Text style={styles.rowSub}>They can enter {user?.email} in their app</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>YOUR COACH</Text>
            {coach ? (
              <View style={styles.row}>
                <Ionicons name="person-circle" size={22} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{coach.name}</Text>
                  <Text style={styles.rowSub}>{coach.email}</Text>
                </View>
                <View style={styles.connectedChip}>
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              </View>
            ) : (
              <View style={styles.connectCard}>
                <Text style={styles.connectTitle}>Connect to your coach</Text>
                <View style={styles.segment}>
                  <TouchableOpacity
                    testID="mode-code"
                    style={[styles.segmentBtn, connectMode === "code" && styles.segmentBtnActive]}
                    onPress={() => setConnectMode("code")}
                  >
                    <Text style={[styles.segmentText, connectMode === "code" && styles.segmentTextActive]}>
                      Invite Code
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="mode-email"
                    style={[styles.segmentBtn, connectMode === "email" && styles.segmentBtnActive]}
                    onPress={() => setConnectMode("email")}
                  >
                    <Text style={[styles.segmentText, connectMode === "email" && styles.segmentTextActive]}>
                      Coach Email
                    </Text>
                  </TouchableOpacity>
                </View>
                {connectMode === "code" ? (
                  <>
                    <Text style={styles.connectHint}>
                      Ask your coach for their 6-character invite code.
                    </Text>
                    <TextInput
                      testID="coach-code-input"
                      style={styles.codeInput}
                      value={code}
                      onChangeText={setCode}
                      placeholder="••••••"
                      placeholderTextColor={colors.onSurfaceSecondary}
                      autoCapitalize="characters"
                      maxLength={8}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.connectHint}>
                      Enter the email your coach uses on Co-Coachify.
                    </Text>
                    <TextInput
                      testID="coach-email-input"
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="coach@example.com"
                      placeholderTextColor={colors.onSurfaceSecondary}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </>
                )}
                <Button
                  testID="connect-btn"
                  title={connectMode === "code" ? "Connect with Code" : "Connect with Email"}
                  onPress={connect}
                  loading={joining}
                  style={{ marginTop: spacing.lg }}
                />
                {joinMsg && <Text style={styles.joinMsg}>{joinMsg}</Text>}
              </View>
            )}
          </>
        )}

        {/* Appearance */}
        <Text style={styles.sectionTitle}>APPEARANCE</Text>
        <View style={styles.swatchCard}>
          <Text style={styles.rowSub}>Accent color — applies across the whole app</Text>
          <View style={styles.swatchRow}>
            {ACCENTS.map((a) => (
              <TouchableOpacity
                key={a.name}
                testID={`accent-${a.name.replace(" ", "-")}`}
                style={[
                  styles.swatch,
                  { backgroundColor: a.brand },
                  accentColor === a.brand && styles.swatchActive,
                ]}
                onPress={() => setAccent(a)}
              >
                {accentColor === a.brand && (
                  <Ionicons name="checkmark" size={18} color={a.onBrand} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Premium */}
        {!user?.is_premium && (
          <>
            <Text style={styles.sectionTitle}>MEMBERSHIP</Text>
            <TouchableOpacity
              testID="go-premium-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/paywall")}
            >
              <Ionicons name="star" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Go Premium</Text>
                <Text style={styles.rowSub}>Unlock the full Co-Coachify experience</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
          </>
        )}

        {/* About */}
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.row}>
          <Ionicons name="information-circle" size={20} color={colors.onSurfaceSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Co-Coachify</Text>
            <Text style={styles.rowSub}>Version 1.0.0</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
          <Button testID="logout-btn" title="Log Out" variant="secondary" onPress={confirmLogout} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    color: colors.onSurface,
    letterSpacing: 1,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onBrandTertiary },
  profileName: { fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface },
  profileEmail: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  roleText: { fontFamily: fonts.bold, fontSize: 10, color: colors.brandSecondary, letterSpacing: 1.5, marginTop: 3 },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  premiumText: { fontFamily: fonts.bold, fontSize: 9, color: colors.onBrandTertiary, letterSpacing: 0.8 },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 13,
    color: colors.brand,
    letterSpacing: 1.2,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 56,
  },
  rowTitle: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.onSurface },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  connectedChip: {
    backgroundColor: "rgba(50,215,75,0.12)",
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  connectedText: { fontFamily: fonts.bold, fontSize: 11, color: colors.success },
  connectCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  connectTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segmentBtnActive: { backgroundColor: colors.brandTertiary },
  segmentText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceSecondary },
  segmentTextActive: { color: colors.onSurface },
  connectHint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, marginTop: spacing.md },
  codeInput: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.onSurface,
    fontFamily: fonts.displayBold,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: "center",
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  joinMsg: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.brandSecondary, marginTop: spacing.md, textAlign: "center" },
  swatchCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  swatchRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchActive: { borderWidth: 3, borderColor: "#FFFFFF" },
  specRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  specChip: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  specText: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.onSurfaceSecondary },
});
