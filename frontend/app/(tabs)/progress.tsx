import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BarChart from "@/src/components/BarChart";
import Button from "@/src/components/Button";
import LineChart from "@/src/components/LineChart";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Summary = {
  weight_series: { date: string; value: number }[];
  duration_series: { date: string; value: number; label: string | null }[];
  rpe_series: { date: string; value: number }[];
  totals: { total_workouts: number; total_minutes: number; week_workouts: number; week_minutes: number };
};

type Log = {
  id: string;
  log_type: string;
  session_name: string | null;
  duration_minutes: number | null;
  rpe: number | null;
  weight: number | null;
  notes: string | null;
  date: string;
};

export default function Progress() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 500) - spacing.xl * 2 - spacing.lg * 2;
  const [tab, setTab] = useState<"workouts" | "body">("workouts");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api<Summary>("/progress/summary"), api<Log[]>("/logs")]);
      setSummary(s);
      setLogs(l);
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const logWeight = async () => {
    const w = parseFloat(weightInput);
    if (!w || w <= 0) return;
    setSavingWeight(true);
    try {
      await api("/logs", { method: "POST", body: { log_type: "body", weight: w } });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setWeightInput("");
      await load();
    } catch {
      // ignore
    } finally {
      setSavingWeight(false);
    }
  };

  const workoutLogs = logs.filter((l) => l.log_type === "workout");
  const bodyLogs = logs.filter((l) => l.log_type === "body");

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxxl + spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>PROGRESS</Text>

        {/* Segmented control */}
        <View style={styles.segment}>
          {(["workouts", "body"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              testID={`segment-${t}`}
              style={[styles.segmentBtn, tab === t && styles.segmentBtnActive]}
              onPress={() => {
                setTab(t);
                if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
              }}
            >
              <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
                {t === "workouts" ? "Workouts" : "Body"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "workouts" ? (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{summary?.totals.total_workouts ?? 0}</Text>
                <Text style={styles.statLabel}>Total workouts</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{summary?.totals.total_minutes ?? 0}</Text>
                <Text style={styles.statLabel}>Total minutes</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{summary?.totals.week_workouts ?? 0}</Text>
                <Text style={styles.statLabel}>This week</Text>
              </View>
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>WORKOUT DURATION (MIN)</Text>
              <BarChart data={summary?.duration_series ?? []} width={chartWidth} />
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>EFFORT (RPE)</Text>
              <LineChart data={summary?.rpe_series ?? []} width={chartWidth} color={colors.brandSecondary} />
            </View>

            <Text style={styles.historyTitle}>HISTORY</Text>
            {workoutLogs.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="barbell-outline" size={36} color={colors.onSurfaceSecondary} />
                <Text style={styles.emptyText}>Your workout history is empty. Time to lift!</Text>
              </View>
            ) : (
              workoutLogs.map((l) => (
                <View key={l.id} style={styles.logRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logName}>{l.session_name ?? "Workout"}</Text>
                    <Text style={styles.logMeta}>
                      {formatDate(l.date)}
                      {l.duration_minutes ? ` · ${l.duration_minutes} min` : ""}
                      {l.rpe ? ` · RPE ${l.rpe}` : ""}
                    </Text>
                    {l.notes ? <Text style={styles.logNotes}>{l.notes}</Text> : null}
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                </View>
              ))
            )}
          </>
        ) : (
          <>
            <View style={styles.weightInputCard}>
              <Text style={styles.chartTitle}>LOG BODY WEIGHT</Text>
              <View style={styles.weightRow}>
                <TextInput
                  testID="weight-input"
                  style={styles.weightInput}
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 75.5"
                  placeholderTextColor={colors.onSurfaceSecondary}
                />
                <Button
                  testID="log-weight-btn"
                  title="Log"
                  onPress={logWeight}
                  loading={savingWeight}
                  style={{ minWidth: 88 }}
                />
              </View>
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>WEIGHT TREND</Text>
              <LineChart data={summary?.weight_series ?? []} width={chartWidth} unit=" kg" />
            </View>

            <Text style={styles.historyTitle}>ENTRIES</Text>
            {bodyLogs.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="scale-outline" size={36} color={colors.onSurfaceSecondary} />
                <Text style={styles.emptyText}>No body metrics yet. Log your first weigh-in above.</Text>
              </View>
            ) : (
              bodyLogs.map((l) => (
                <View key={l.id} style={styles.logRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logName}>{l.weight} kg</Text>
                    <Text style={styles.logMeta}>{formatDate(l.date)}</Text>
                  </View>
                  <Ionicons name="trending-up" size={18} color={colors.brand} />
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    color: colors.onSurface,
    letterSpacing: 1,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: 4,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segmentBtnActive: { backgroundColor: colors.surfaceTertiary },
  segmentText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceSecondary },
  segmentTextActive: { color: colors.onSurface },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  statValue: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface },
  statLabel: { fontFamily: fonts.medium, fontSize: 10, color: colors.onSurfaceSecondary, marginTop: 2, textAlign: "center" },
  chartCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  chartTitle: { fontFamily: fonts.display, fontSize: 13, color: colors.brand, letterSpacing: 1, marginBottom: spacing.md },
  historyTitle: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.onSurface,
    letterSpacing: 1,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyBox: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyText: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary, textAlign: "center" },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 56,
  },
  logName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  logMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  logNotes: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 3, fontStyle: "italic" },
  weightInputCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  weightRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  weightInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
});
