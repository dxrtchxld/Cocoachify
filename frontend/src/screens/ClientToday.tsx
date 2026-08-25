import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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

import Button from "@/src/components/Button";
import ProgressRing from "@/src/components/ProgressRing";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, fonts, images, radius, spacing } from "@/src/theme";

type DashboardData = {
  user: { name: string };
  streak: number;
  logged_today: boolean;
  week: { workouts: number; minutes: number; goal_workouts: number; goal_minutes: number };
  today_session: {
    session_id: string | null;
    name: string;
    session_type: string;
    target_minutes: number;
    exercise_count: number;
    coach_notes: string | null;
    day: number;
  } | null;
  program: { id: string; name: string; total_days: number; current_day: number; cover_image: string | null } | null;
};

export default function ClientToday() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setData(await api<DashboardData>("/dashboard"));
    } catch {
      setError(true);
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

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Unable to load today&apos;s plan</Text>
        <Button title="Retry" onPress={load} variant="secondary" style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  const week = data.week;
  const isRest = data.today_session?.session_type === "rest";
  const hasCoach = !!user?.coach_id;

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
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.userName}>{data.user.name || user?.name}</Text>
          </View>
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={18} color={colors.brand} />
            <Text style={styles.streakText}>{data.streak} Day Streak</Text>
          </View>
        </View>

        {/* Connect to coach prompt */}
        {!hasCoach && (
          <TouchableOpacity
            testID="connect-coach-card"
            style={styles.connectCard}
            activeOpacity={0.85}
            onPress={() => router.push("/(tabs)/settings")}
          >
            <View style={styles.connectIcon}>
              <Ionicons name="link" size={22} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectTitle}>Connect to your coach</Text>
              <Text style={styles.connectSub}>
                Enter their invite code or email so they can assign your program.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>
        )}

        {/* Weekly metrics */}
        <View style={styles.metricsCard}>
          <ProgressRing
            progress={week.workouts / week.goal_workouts}
            value={`${week.workouts}/${week.goal_workouts}`}
            label="Workouts this week"
          />
          <ProgressRing
            progress={week.minutes / week.goal_minutes}
            value={`${week.minutes}`}
            label="Active minutes"
            color={colors.brandSecondary}
          />
          <ProgressRing
            progress={data.logged_today ? 1 : 0}
            value={data.logged_today ? "✓" : "—"}
            label={data.logged_today ? "Checked in" : "No check-in yet"}
            color={colors.success}
          />
        </View>

        {/* Today's workout */}
        <Text style={styles.sectionTitle}>TODAY&apos;S WORKOUT</Text>
        {data.today_session && data.program ? (
          <View style={styles.planCard}>
            <Image
              source={{ uri: data.program.cover_image || images.workoutCardBg }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <LinearGradient
              colors={["rgba(18,18,20,0.3)", "rgba(18,18,20,0.94)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.planContent}>
              <View style={styles.dayChip}>
                <Text style={styles.dayChipText}>
                  DAY {data.program.current_day} / {data.program.total_days}
                </Text>
              </View>
              <Text style={styles.planSession}>{data.today_session.name}</Text>
              <Text style={styles.planMeta}>
                {data.program.name}
                {!isRest &&
                  ` · ${data.today_session.target_minutes} min · ${data.today_session.exercise_count} exercises`}
              </Text>
              {isRest ? (
                <View style={styles.restNote}>
                  <Ionicons name="moon" size={16} color={colors.brandSecondary} />
                  <Text style={styles.restNoteText}>
                    {data.today_session.coach_notes || "Recovery day — rest well."}
                  </Text>
                </View>
              ) : (
                <Button
                  testID="start-workout-btn"
                  title="Start Workout"
                  onPress={() =>
                    router.push({
                      pathname: "/session/[id]",
                      params: {
                        id: data.today_session!.session_id!,
                        programId: data.program!.id,
                      },
                    })
                  }
                  style={{ marginTop: spacing.lg }}
                />
              )}
            </View>
          </View>
        ) : (
          <View style={styles.emptyPlan}>
            <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
            <Text style={styles.emptyTitle}>No workout assigned for today.</Text>
            <Text style={styles.emptySub}>
              {hasCoach
                ? "Your coach hasn't assigned a program yet. They'll set you up soon."
                : "Connect to your coach to receive your personalized program."}
            </Text>
          </View>
        )}

        {/* Coach note */}
        {!isRest && data.today_session?.coach_notes ? (
          <View style={styles.noteCard}>
            <Ionicons name="chatbubble-ellipses" size={18} color={colors.brand} />
            <Text style={styles.noteText}>{data.today_session.coach_notes}</Text>
          </View>
        ) : null}

        {/* Quick action */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/(tabs)/progress")}
            activeOpacity={0.8}
          >
            <Ionicons name="trending-up" size={22} color={colors.brand} />
            <Text style={styles.quickText}>Log body weight</Text>
          </TouchableOpacity>
          {data.program && (
            <TouchableOpacity
              style={styles.quickCard}
              onPress={() =>
                router.push({ pathname: "/program/[id]", params: { id: data.program!.id } })
              }
              activeOpacity={0.8}
            >
              <Ionicons name="calendar" size={22} color={colors.brand} />
              <Text style={styles.quickText}>View full program</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  errorText: { fontFamily: fonts.semiBold, color: colors.onSurface, fontSize: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  greeting: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceSecondary },
  userName: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.onSurface, letterSpacing: 0.5 },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  streakText: { fontFamily: fonts.bold, fontSize: 12, color: colors.onBrandTertiary },
  connectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    minHeight: 72,
  },
  connectIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,75,58,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  connectTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  connectSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2, lineHeight: 17 },
  metricsCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.onSurface,
    letterSpacing: 1,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  planCard: {
    marginHorizontal: spacing.xl,
    borderRadius: radius.lg,
    overflow: "hidden",
    minHeight: 200,
  },
  planContent: { padding: spacing.xl, marginTop: 40 },
  dayChip: {
    alignSelf: "flex-start",
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  dayChipText: { fontFamily: fonts.bold, fontSize: 11, color: colors.onBrand, letterSpacing: 1 },
  planSession: {
    fontFamily: fonts.displayBold,
    fontSize: 26,
    color: colors.onSurface,
    marginTop: spacing.sm,
  },
  planMeta: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 4 },
  restNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    backgroundColor: "rgba(28,28,30,0.8)",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  restNoteText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceTertiary },
  emptyPlan: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.onSurface, marginTop: spacing.md, textAlign: "center" },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 19,
  },
  noteCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  noteText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 19 },
  quickRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  quickCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 80,
    justifyContent: "center",
  },
  quickText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurface },
});
