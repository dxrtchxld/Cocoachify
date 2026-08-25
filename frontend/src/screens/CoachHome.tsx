import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { vocabFor } from "@/src/lib/vocab";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Stats = { clients: number; programs: number; active_pct: number };
type Client = {
  user_id: string;
  name: string;
  status: string;
  program_name: string | null;
  last_checkin: string | null;
};
type Activity = {
  id: string;
  client_name: string | null;
  log_type: string;
  session_name: string | null;
  duration_minutes: number | null;
  rpe: number | null;
  weight: number | null;
  notes: string | null;
  date: string;
};
type CheckIn = {
  id: string;
  user_id: string;
  client_name: string | null;
  session_name: string | null;
  notes: string | null;
  date: string;
  urgency: "urgent" | "watch" | "normal";
  reviewed: boolean;
};
type Section = { key: string; visible: boolean };

const DEFAULT_LAYOUT: Section[] = [
  { key: "stats", visible: true },
  { key: "quick_actions", visible: true },
  { key: "needs_attention", visible: true },
  { key: "inbox_preview", visible: true },
  { key: "recent_activity", visible: true },
];

export default function CoachHome() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [inbox, setInbox] = useState<CheckIn[]>([]);
  const [layout, setLayout] = useState<Section[]>(DEFAULT_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c, a, ib, lay] = await Promise.all([
        api<Stats>("/coach/stats"),
        api<Client[]>("/coach/clients"),
        api<Activity[]>("/coach/activity"),
        api<CheckIn[]>("/coach/inbox"),
        api<{ sections: Section[] }>("/me/dashboard-layout"),
      ]);
      setStats(s);
      setClients(c);
      setActivity(a);
      setInbox(ib);
      setLayout(lay.sections?.length ? lay.sections : DEFAULT_LAYOUT);
    } catch {
      // keep last state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const needsAttention = clients.filter((c) => c.status !== "on_track");
  const newCheckins = inbox.filter((i) => !i.reviewed);

  const renderSection = (key: string) => {
    switch (key) {
      case "stats":
        return (
          <View key={key} style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="people" size={20} color={colors.brand} />
              <Text style={styles.statValue}>{stats?.clients ?? 0}</Text>
              <Text style={styles.statLabel}>CLIENTS</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="albums" size={20} color={colors.brand} />
              <Text style={styles.statValue}>{stats?.programs ?? 0}</Text>
              <Text style={styles.statLabel}>PROGRAMS</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="sparkles" size={20} color={colors.brand} />
              <Text style={styles.statValue}>{stats?.active_pct ?? 0}%</Text>
              <Text style={styles.statLabel}>ACTIVE</Text>
            </View>
          </View>
        );
      case "quick_actions":
        return (
          <View key={key} style={styles.quickRow}>
            <TouchableOpacity
              testID="quick-invite"
              style={styles.quickCard}
              activeOpacity={0.8}
              onPress={() => router.push("/invite")}
            >
              <Ionicons name="qr-code" size={20} color={colors.brand} />
              <Text style={styles.quickText}>Invite Client</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="quick-new-program"
              style={styles.quickCard}
              activeOpacity={0.8}
              onPress={() => router.push("/program-editor")}
            >
              <Ionicons name="add-circle" size={20} color={colors.brand} />
              <Text style={styles.quickText}>New Program</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="quick-library"
              style={styles.quickCard}
              activeOpacity={0.8}
              onPress={() => router.push("/exercise-library")}
            >
              <Ionicons name="barbell" size={20} color={colors.brand} />
              <Text style={styles.quickText}>Exercise Library</Text>
            </TouchableOpacity>
          </View>
        );
      case "needs_attention":
        return (
          <View key={key}>
            <View style={styles.sectionRow}>
              <Ionicons name="alert-circle" size={16} color={colors.brand} />
              <Text style={styles.sectionTitle}>NEEDS ATTENTION ({needsAttention.length})</Text>
            </View>
            {needsAttention.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Nothing needs attention right now.</Text>
              </View>
            ) : (
              needsAttention.slice(0, 5).map((c) => (
                <TouchableOpacity
                  key={c.user_id}
                  testID={`attention-${c.user_id}`}
                  style={styles.clientRow}
                  activeOpacity={0.7}
                  onPress={() => router.push({ pathname: "/client/[id]", params: { id: c.user_id } })}
                >
                  <View style={styles.miniAvatar}>
                    <Text style={styles.miniAvatarText}>{(c.name || "C")[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clientName}>{c.name}</Text>
                    <Text style={styles.clientSub}>
                      {c.status === "no_program" ? "No active program" : "No recent check-ins"}
                    </Text>
                  </View>
                  <View style={[styles.statusChip, c.status === "behind" ? styles.chipBehind : styles.chipNone]}>
                    <Text style={styles.statusChipText}>
                      {c.status === "behind" ? "Behind" : "Assign"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      case "inbox_preview":
        return (
          <View key={key}>
            <View style={styles.sectionRow}>
              <Ionicons name="mail-unread" size={16} color={colors.brand} />
              <Text style={styles.sectionTitle}>NEW CHECK-INS ({newCheckins.length})</Text>
            </View>
            {newCheckins.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>You&apos;re all caught up. 🎉</Text>
              </View>
            ) : (
              newCheckins.slice(0, 4).map((i) => (
                <TouchableOpacity
                  key={i.id}
                  testID={`home-checkin-${i.id}`}
                  style={styles.clientRow}
                  activeOpacity={0.7}
                  onPress={() => router.push("/(tabs)/inbox")}
                >
                  <Ionicons
                    name={i.urgency === "urgent" ? "warning" : "chatbox-ellipses"}
                    size={18}
                    color={i.urgency === "urgent" ? colors.error : colors.brand}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clientName}>{i.client_name}</Text>
                    <Text style={styles.clientSub} numberOfLines={1}>
                      {i.notes || i.session_name || "Completed a check-in"}
                    </Text>
                  </View>
                  <Text style={styles.activityDate}>{formatDate(i.date)}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      case "recent_activity":
        return (
          <View key={key}>
            <View style={styles.sectionRow}>
              <Ionicons name="pulse" size={16} color={colors.brand} />
              <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
            </View>
            {activity.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Client check-ins will appear here.</Text>
              </View>
            ) : (
              activity.slice(0, 8).map((a) => (
                <View key={a.id} style={styles.activityRow}>
                  <Ionicons
                    name={a.log_type === "body" ? "scale" : "checkmark-circle"}
                    size={18}
                    color={colors.success}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityText}>
                      <Text style={{ fontFamily: fonts.bold }}>{a.client_name}</Text>
                      {a.log_type === "body"
                        ? ` logged ${a.weight} kg`
                        : ` completed ${a.session_name ?? "a workout"}`}
                      {a.rpe ? ` · RPE ${a.rpe}` : ""}
                    </Text>
                    {a.notes ? <Text style={styles.activityNotes}>&ldquo;{a.notes}&rdquo;</Text> : null}
                  </View>
                  <Text style={styles.activityDate}>{formatDate(a.date)}</Text>
                </View>
              ))
            )}
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {vocabFor(user?.coach_specialty).emoji}{" "}
              {user?.coach_specialty ? `${user.coach_specialty.toUpperCase()} ` : ""}
              {vocabFor(user?.coach_specialty).homeTitle}
            </Text>
            <Text style={styles.sub}>
              Today&apos;s triage — which {vocabFor(user?.coach_specialty).clientWord} need you first.
            </Text>
          </View>
          <TouchableOpacity
            testID="customize-dashboard-btn"
            style={styles.customizeBtn}
            activeOpacity={0.8}
            onPress={() => router.push("/dashboard-customize")}
          >
            <Ionicons name="options" size={20} color={colors.onSurface} />
          </TouchableOpacity>
        </View>

        {layout.filter((s) => s.visible).map((s) => renderSection(s.key))}

        {clients.length > 0 && (
          <TouchableOpacity
            testID="view-all-clients"
            style={styles.viewAllBtn}
            onPress={() => router.push("/(tabs)/clients")}
          >
            <Text style={styles.viewAllText}>View all {clients.length} clients →</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footerName}>Signed in as {user?.name}</Text>
      </ScrollView>
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  customizeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.md,
  },
  title: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, letterSpacing: 1 },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    gap: 4,
  },
  statValue: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface },
  statLabel: { fontFamily: fonts.semiBold, fontSize: 9, color: colors.onSurfaceSecondary, letterSpacing: 1 },
  quickRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.md },
  quickCard: {
    flex: 1,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: 6,
    minHeight: 68,
    justifyContent: "center",
  },
  quickText: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.onSurface, textAlign: "center" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontFamily: fonts.display, fontSize: 13, color: colors.onSurface, letterSpacing: 1.2 },
  emptyCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  emptyText: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 60,
  },
  miniAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  miniAvatarText: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurfaceTertiary },
  clientName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  clientSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  statusChip: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  chipBehind: { backgroundColor: "rgba(255,214,10,0.15)" },
  chipNone: { backgroundColor: colors.brandTertiary },
  statusChipText: { fontFamily: fonts.bold, fontSize: 11, color: colors.onSurface },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  activityText: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 19 },
  activityNotes: { fontFamily: fonts.regular, fontSize: 12, fontStyle: "italic", color: colors.onSurfaceSecondary, marginTop: 2 },
  activityDate: { fontFamily: fonts.medium, fontSize: 11, color: colors.onSurfaceSecondary },
  viewAllBtn: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  viewAllText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurface },
  footerName: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.xxl,
  },
});
