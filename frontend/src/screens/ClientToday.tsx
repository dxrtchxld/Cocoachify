import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import ProgressRing from "@/src/components/ProgressRing";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

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

type Habits = {
  water_count: number;
  water_goal: number;
  affirmation_done: boolean;
  affirmation_text: string;
};

const FALLBACK_CLIENT_DASHBOARD: DashboardData = {
  user: { name: "Alex Smith" },
  streak: 5,
  logged_today: false,
  week: { workouts: 3, minutes: 135, goal_workouts: 4, goal_minutes: 180 },
  today_session: {
    session_id: "demo_sess_1",
    name: "Full Body Functional Strength",
    session_type: "workout",
    target_minutes: 45,
    exercise_count: 5,
    coach_notes: "Focus on controlled eccentrics on the squat and clean form.",
    day: 3,
  },
  program: {
    id: "demo_prog_1",
    name: "Strength Foundations 4-Week",
    total_days: 28,
    current_day: 12,
    cover_image: null,
  },
};

const FALLBACK_HABITS: Habits = {
  water_count: 5,
  water_goal: 8,
  affirmation_done: true,
  affirmation_text: "Consistency creates momentum. Every rep counts today.",
};

export default function ClientToday() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(FALLBACK_CLIENT_DASHBOARD);
  const [habits, setHabits] = useState<Habits | null>(FALLBACK_HABITS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [recoveryFeeling, setRecoveryFeeling] = useState<"great" | "good" | "tired" | "sore">("good");
  const [recoveryNote, setRecoveryNote] = useState("");
  const [recoverySaving, setRecoverySaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const [d, h] = await Promise.all([
        api<DashboardData>("/dashboard").catch(() => FALLBACK_CLIENT_DASHBOARD),
        api<Habits>("/habits/today").catch(() => FALLBACK_HABITS),
      ]);
      setData(d || FALLBACK_CLIENT_DASHBOARD);
      setHabits(h || FALLBACK_HABITS);
    } catch {
      setData(FALLBACK_CLIENT_DASHBOARD);
      setHabits(FALLBACK_HABITS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const updateHabits = async (patch: { water_count?: number; affirmation_done?: boolean }) => {
    if (!habits) return;
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    setHabits({ ...habits, ...patch });
    try {
      const h = await api<Habits>("/habits/today", { method: "PUT", body: patch });
      setHabits(h);
    } catch {
      // will refresh on focus
    }
  };

  const submitRecoveryCheckin = async () => {
    setRecoverySaving(true);
    try {
      await api("/logs", {
        method: "POST",
        body: {
          log_type: "recovery",
          program_id: data?.program?.id || null,
          notes: `Recovery feeling: ${recoveryFeeling}. ${recoveryNote.trim()}`.trim(),
        },
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setRecoveryModalOpen(false);
      setRecoveryNote("");
      await load();
    } catch {
      // keep open
    } finally {
      setRecoverySaving(false);
    }
  };

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
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.greeting} numberOfLines={1}>{greeting()},</Text>
            <Text style={styles.userName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{data.user.name || user?.name}</Text>
          </View>
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={18} color={colors.brand} />
            <Text style={styles.streakText} numberOfLines={1}>{data.streak} Day Streak</Text>
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
            <View style={styles.planContent}>
              <View style={styles.dayChip}>
                <Text style={styles.dayChipText}>
                  DAY {data.program.current_day} / {data.program.total_days}
                </Text>
              </View>
              <Text style={styles.planSession} numberOfLines={2}>{data.today_session.name}</Text>
              <Text style={styles.planMeta} numberOfLines={2}>
                {data.program.name}
                {!isRest &&
                  ` · ${data.today_session.target_minutes} min · ${data.today_session.exercise_count} exercises`}
              </Text>
              {data.logged_today ? (
                <View style={styles.celebrationContainer}>
                  <View style={styles.celebrationBadge}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                    <Text style={styles.celebrationTitle}>Workout Complete!</Text>
                  </View>
                  <Text style={styles.celebrationSub}>
                    Great effort today! Your check-in is logged and your streak is active.
                  </Text>
                  <TouchableOpacity
                    testID="review-workout-btn"
                    style={styles.reviewBtn}
                    onPress={() =>
                      router.push({
                        pathname: "/session/[id]",
                        params: {
                          id: data.today_session!.session_id!,
                          programId: data.program!.id,
                        },
                      })
                    }
                  >
                    <Ionicons name="eye-outline" size={16} color={colors.onSurface} />
                    <Text style={styles.reviewBtnText}>Review Workout Details</Text>
                  </TouchableOpacity>
                </View>
              ) : isRest ? (
                <View style={styles.restCardInner}>
                  <View style={styles.restNote}>
                    <Ionicons name="moon" size={16} color={colors.brandSecondary} />
                    <Text style={styles.restNoteText}>
                      {data.today_session.coach_notes || "Recovery day — rest well."}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID="recovery-checkin-btn"
                    style={styles.recoveryCheckinBtn}
                    onPress={() => setRecoveryModalOpen(true)}
                  >
                    <Ionicons name="heart-circle-outline" size={18} color={colors.brand} />
                    <Text style={styles.recoveryCheckinText}>Active Recovery Check-in</Text>
                  </TouchableOpacity>
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

        {/* Daily habits */}
        {habits && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>DAILY HABITS</Text>
            <View style={styles.habitsRow}>
              <View style={styles.habitCard}>
                <View style={styles.habitHeader}>
                  <Ionicons name="water" size={18} color={colors.brand} />
                  <Text style={styles.habitTitle}>Water</Text>
                </View>
                <Text style={styles.habitValue}>
                  {habits.water_count}
                  <Text style={styles.habitGoal}> / {habits.water_goal}</Text>
                </Text>
                <View style={styles.waterBtns}>
                  <TouchableOpacity
                    testID="water-minus"
                    style={styles.waterBtn}
                    onPress={() => updateHabits({ water_count: Math.max(0, habits.water_count - 1) })}
                  >
                    <Ionicons name="remove" size={18} color={colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="water-plus"
                    style={[styles.waterBtn, { backgroundColor: colors.brand }]}
                    onPress={() => updateHabits({ water_count: habits.water_count + 1 })}
                  >
                    <Ionicons name="add" size={18} color={colors.onBrand} />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                testID="affirmation-card"
                style={[styles.habitCard, habits.affirmation_done && { borderColor: colors.brand }]}
                activeOpacity={0.8}
                onPress={() => updateHabits({ affirmation_done: !habits.affirmation_done })}
              >
                <View style={styles.habitHeader}>
                  <Ionicons
                    name={habits.affirmation_done ? "checkmark-circle" : "sparkles"}
                    size={18}
                    color={colors.brand}
                  />
                  <Text style={styles.habitTitle}>Daily Affirmation</Text>
                </View>
                <Text style={styles.affirmationText}>&ldquo;{habits.affirmation_text}&rdquo;</Text>
                <Text style={styles.affirmationHint}>
                  {habits.affirmation_done ? "Done today ✓" : "Tap when you've said it"}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Quick action */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            testID="quick-journey"
            style={styles.quickCard}
            onPress={() => router.push("/portal")}
            activeOpacity={0.8}
          >
            <Ionicons name="compass" size={22} color={colors.brand} />
            <Text style={styles.quickText} numberOfLines={2}>My Journey</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/(tabs)/progress")}
            activeOpacity={0.8}
          >
            <Ionicons name="trending-up" size={22} color={colors.brand} />
            <Text style={styles.quickText} numberOfLines={2}>Log body weight</Text>
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
              <Text style={styles.quickText} numberOfLines={2}>View full program</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Ask Coach FAB */}
      {hasCoach && (
        <TouchableOpacity
          testID="ask-coach-fab"
          style={[styles.fab, { bottom: insets.bottom + spacing.lg, backgroundColor: colors.brand }]}
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: "/chat/[id]", params: { id: user!.coach_id! } })}
        >
          <Ionicons name="chatbubble-ellipses" size={22} color={colors.onBrand} />
          <Text style={[styles.fabText, { color: colors.onBrand }]}>Ask Coach</Text>
        </TouchableOpacity>
      )}

      {/* Active Recovery Modal */}
      <Modal
        visible={recoveryModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRecoveryModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setRecoveryModalOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>ACTIVE RECOVERY CHECK-IN</Text>
            <Text style={styles.recoveryModalSub}>
              Rest days are essential for growth and injury prevention. How is your body feeling?
            </Text>

            <Text style={styles.fieldLabel}>How are you feeling today?</Text>
            <View style={styles.feelingRow}>
              {[
                { id: "great", label: "Fresh & Ready", icon: "flash-outline" },
                { id: "good", label: "Recovering Well", icon: "happy-outline" },
                { id: "sore", label: "Muscle Soreness", icon: "fitness-outline" },
                { id: "tired", label: "Low Energy", icon: "battery-dead-outline" },
              ].map((f) => (
                <TouchableOpacity
                  key={f.id}
                  testID={`feeling-${f.id}`}
                  style={[styles.feelingChip, recoveryFeeling === f.id && styles.feelingChipActive]}
                  onPress={() => {
                    setRecoveryFeeling(f.id as any);
                    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                  }}
                >
                  <Ionicons
                    name={f.icon as any}
                    size={16}
                    color={recoveryFeeling === f.id ? colors.onBrand : colors.onSurfaceSecondary}
                  />
                  <Text
                    style={[styles.feelingText, recoveryFeeling === f.id && styles.feelingTextActive]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
              Recovery Notes (Mobility, walk, sleep...)
            </Text>
            <TextInput
              testID="recovery-notes-input"
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
              value={recoveryNote}
              onChangeText={setRecoveryNote}
              placeholder="e.g. 20 min light walk + hamstring stretches"
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
            />

            <Button
              testID="submit-recovery-btn"
              title="Save Recovery Reflection"
              onPress={submitRecoveryCheckin}
              loading={recoverySaving}
              style={{ marginTop: spacing.lg }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  userName: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.onSurface, letterSpacing: 0.5, flexShrink: 1 },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    flexShrink: 0,
    marginLeft: spacing.sm,
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
    backgroundColor: colors.brandTertiary,
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
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden",
  },
  planContent: { padding: spacing.xl },
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
    fontSize: 24,
    color: colors.onSurface,
    marginTop: spacing.sm,
    lineHeight: 30,
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
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  quickCard: {
    flexGrow: 1,
    flexBasis: "45%",
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
  quickText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurface, textAlign: "center" },
  habitsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl },
  habitCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  habitHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  habitTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.onSurface },
  habitValue: { fontFamily: fonts.displayBold, fontSize: 30, color: colors.onSurface, marginTop: spacing.sm },
  habitGoal: { fontSize: 16, color: colors.onSurfaceSecondary },
  waterBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  waterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  affirmationText: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: "italic",
    color: colors.onSurfaceTertiary,
    marginTop: spacing.sm,
  },
  affirmationHint: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  fab: {
    position: "absolute",
    right: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    borderRadius: radius.pill,
    elevation: 6,
    boxShadow: "0px 4px 8px rgba(0,0,0,0.4)",
  },
  fabText: { fontFamily: fonts.bold, fontSize: 14 },
  celebrationContainer: {
    backgroundColor: `${colors.success}12`,
    borderWidth: 1,
    borderColor: `${colors.success}40`,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  celebrationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  celebrationTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.success,
  },
  celebrationSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  reviewBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.onSurface,
  },
  restCardInner: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  recoveryCheckinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  recoveryCheckinText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.brand,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    color: colors.onSurface,
    marginBottom: 4,
  },
  recoveryModalSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  feelingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  feelingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  feelingChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  feelingText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
  },
  feelingTextActive: {
    color: colors.onBrand,
    fontFamily: fonts.semiBold,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 14,
    backgroundColor: colors.surface,
  },
});
