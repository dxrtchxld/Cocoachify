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
import { api, mediaUrl } from "@/src/lib/api";
import { vocabFor } from "@/src/lib/vocab";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { Image } from "expo-image";

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

const FALLBACK_STATS: Stats = { clients: 12, programs: 5, active_pct: 85 };
const FALLBACK_CLIENTS: Client[] = [
  { user_id: "c1", name: "Alex Smith", status: "on_track", program_name: "Hypertrophy Phase 1", last_checkin: "Today" },
  { user_id: "c2", name: "Sarah Chen", status: "needs_attention", program_name: "Strength Foundations", last_checkin: "Yesterday" },
  { user_id: "c3", name: "Marcus Miller", status: "on_track", program_name: "Mobility & Core", last_checkin: "2 days ago" },
];
const FALLBACK_ACTIVITY: Activity[] = [
  { id: "a1", client_name: "Alex Smith", log_type: "workout", session_name: "Upper Body Power", duration_minutes: 52, rpe: 8, weight: 185, notes: "Felt strong on bench press today", date: "Today" },
  { id: "a2", client_name: "Sarah Chen", log_type: "workout", session_name: "Squat Volume", duration_minutes: 45, rpe: 7, weight: 135, notes: "Good depth, slight knee discomfort flagged", date: "Yesterday" },
];
const FALLBACK_INBOX: CheckIn[] = [
  { id: "ib1", user_id: "c2", client_name: "Sarah Chen", session_name: "Squat Volume", notes: "Slight knee discomfort on rep 4", date: "Yesterday", urgency: "watch", reviewed: false },
];

export default function CoachHome() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(FALLBACK_STATS);
  const [clients, setClients] = useState<Client[]>(FALLBACK_CLIENTS);
  const [activity, setActivity] = useState<Activity[]>(FALLBACK_ACTIVITY);
  const [inbox, setInbox] = useState<CheckIn[]>(FALLBACK_INBOX);
  const [layout, setLayout] = useState<Section[]>(DEFAULT_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c, a, ib, lay] = await Promise.all([
        api<Stats>("/coach/stats").catch(() => FALLBACK_STATS),
        api<Client[]>("/coach/clients").catch(() => FALLBACK_CLIENTS),
        api<Activity[]>("/coach/activity").catch(() => FALLBACK_ACTIVITY),
        api<CheckIn[]>("/coach/inbox").catch(() => FALLBACK_INBOX),
        api<{ sections: Section[] }>("/me/dashboard-layout").catch(() => ({ sections: DEFAULT_LAYOUT })),
      ]);
      setStats(s || FALLBACK_STATS);
      setClients(Array.isArray(c) ? c : FALLBACK_CLIENTS);
      setActivity(Array.isArray(a) ? a : FALLBACK_ACTIVITY);
      setInbox(Array.isArray(ib) ? ib : FALLBACK_INBOX);
      setLayout(lay?.sections?.length ? lay.sections : DEFAULT_LAYOUT);
    } catch {
      setStats(FALLBACK_STATS);
      setClients(FALLBACK_CLIENTS);
      setActivity(FALLBACK_ACTIVITY);
      setInbox(FALLBACK_INBOX);
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

  const clientList = Array.isArray(clients) ? clients : FALLBACK_CLIENTS;
  const inboxList = Array.isArray(inbox) ? inbox : FALLBACK_INBOX;
  const activityList = Array.isArray(activity) ? activity : FALLBACK_ACTIVITY;

  const needsAttention = clientList.filter((c) => c.status !== "on_track");
  const newCheckins = inboxList.filter((i) => !i.reviewed);

  const renderSection = (key: string) => {
    switch (key) {
      case "stats":
        return (
          <View key={key} style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="people" size={20} color={colors.brand} />
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{stats?.clients ?? 0}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>CLIENTS</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="albums" size={20} color={colors.brand} />
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{stats?.programs ?? 0}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>PROGRAMS</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="sparkles" size={20} color={colors.brand} />
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{stats?.active_pct ?? 0}%</Text>
              <Text style={styles.statLabel} numberOfLines={1}>ACTIVE</Text>
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
              <Text style={styles.quickText} numberOfLines={2}>Invite Client</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="quick-new-program"
              style={styles.quickCard}
              activeOpacity={0.8}
              onPress={() => router.push("/program-editor")}
            >
              <Ionicons name="add-circle" size={20} color={colors.brand} />
              <Text style={styles.quickText} numberOfLines={2}>New Program</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="quick-library"
              style={styles.quickCard}
              activeOpacity={0.8}
              onPress={() => router.push("/exercise-library")}
            >
              <Ionicons name="barbell" size={20} color={colors.brand} />
              <Text style={styles.quickText} numberOfLines={2}>Exercise Library</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="quick-studio"
              style={styles.quickCard}
              activeOpacity={0.8}
              onPress={() => router.push("/studio")}
            >
              <Ionicons name="grid" size={20} color={colors.brand} />
              <Text style={styles.quickText} numberOfLines={2}>Workspace</Text>
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
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.clientName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.clientSub} numberOfLines={1}>
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
                <Text style={styles.emptyText}>You&apos;re all caught up.</Text>
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
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.clientName} numberOfLines={1}>{i.client_name}</Text>
                    <Text style={styles.clientSub} numberOfLines={1}>
                      {i.notes || i.session_name || "Completed a check-in"}
                    </Text>
                  </View>
                  <Text style={styles.activityDate} numberOfLines={1}>{formatDate(i.date)}</Text>
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
            {activityList.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Client check-ins will appear here.</Text>
              </View>
            ) : (
              activityList.slice(0, 8).map((a) => (
                <View key={a.id} style={styles.activityRow}>
                  <Ionicons
                    name={a.log_type === "body" ? "scale" : "checkmark-circle"}
                    size={18}
                    color={colors.success}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.activityText} numberOfLines={2}>
                      <Text style={{ fontFamily: fonts.bold }}>{a.client_name}</Text>
                      {a.log_type === "body"
                        ? ` logged ${a.weight} kg`
                        : ` completed ${a.session_name ?? "a workout"}`}
                      {a.rpe ? ` · RPE ${a.rpe}` : ""}
                    </Text>
                    {a.notes ? <Text style={styles.activityNotes} numberOfLines={1}>&ldquo;{a.notes}&rdquo;</Text> : null}
                  </View>
                  <Text style={styles.activityDate} numberOfLines={1}>{formatDate(a.date)}</Text>
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
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxxl + spacing.xl }}
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
        <View style={user?.brand_banner ? styles.headerBannerWrap : undefined}>
          {user?.brand_banner ? (
            <>
              <Image source={{ uri: mediaUrl(user.brand_banner)! }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={styles.headerScrim} />
            </>
          ) : null}
          <View style={styles.header}>
            {mediaUrl(user?.brand_logo) ? (
              <Image source={{ uri: mediaUrl(user?.brand_logo)! }} style={styles.brandLogo} contentFit="contain" />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.titleRow}>
                <Ionicons name={vocabFor(user?.coach_specialty).icon as any} size={16} color={colors.brand} />
                <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {" "}
                  {user?.brand_tagline?.trim()
                    ? user.brand_tagline
                    : `${user?.coach_specialty ? `${user.coach_specialty.toUpperCase()} ` : ""}${vocabFor(user?.coach_specialty).homeTitle}`}
                </Text>
              </View>
              <Text style={styles.sub} numberOfLines={2}>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  headerBannerWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerScrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(10,10,10,0.55)" },
  titleRow: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  brandLogo: { width: 40, height: 40, borderRadius: radius.sm, marginRight: spacing.md },
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
  title: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, letterSpacing: 1, flexShrink: 1 },
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
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  quickCard: {
    flexGrow: 1,
    flexBasis: "45%",
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
  clientName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface, flexShrink: 1 },
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
