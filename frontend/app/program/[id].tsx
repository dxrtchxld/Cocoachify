import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { categoryMeta, colors, fonts, radius, sessionTypeIcon, spacing } from "@/src/theme";

type ScheduleDay = {
  day: number;
  session_id: string | null;
  session_name: string;
  session_type: string;
  target_minutes: number;
};

type ProgramDetail = {
  id: string;
  name: string;
  description: string;
  category: string;
  total_days: number;
  days_per_week: number;
  difficulty: string;
  spotify_url: string | null;
  owner_id: string | null;
  schedule: ScheduleDay[];
  enrollment: { current_day: number; active: boolean } | null;
};

export default function ProgramScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);

  const isOwner = user?.role === "coach" && program?.owner_id === user.user_id;

  const load = useCallback(async () => {
    try {
      setProgram(await api<ProgramDetail>(`/programs/${id}`));
    } catch {
      setProgram(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const duplicate = async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const copy = await api<{ id: string }>(`/programs/${id}/duplicate`, { method: "POST" });
      router.replace({ pathname: "/program/[id]", params: { id: copy.id } });
    } catch {
      setDuplicating(false);
    }
  };

  const confirmDelete = () => {
    const doDelete = async () => {
      try {
        await api(`/programs/${id}`, { method: "DELETE" });
        router.back();
      } catch {
        // ignore
      }
    };
    if (Platform.OS === "web") {
      if (confirm(`Delete "${program?.name}"?`)) doDelete();
    } else {
      Alert.alert("Delete program", `Delete "${program?.name}"? Active clients will be unassigned.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  if (!program) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.onSurfaceSecondary, fontFamily: fonts.medium }}>
          Program not found.
        </Text>
      </View>
    );
  }

  const meta = categoryMeta[program.category] ?? categoryMeta.fitness;
  const weeks: ScheduleDay[][] = [];
  for (let i = 0; i < program.schedule.length; i += 7) {
    weeks.push(program.schedule.slice(i, i + 7));
  }
  const currentDay = program.enrollment?.current_day ?? 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + 120 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </TouchableOpacity>
          {isOwner && (
            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                testID="duplicate-program-btn"
                onPress={duplicate}
                style={styles.iconBtn}
                disabled={duplicating}
              >
                {duplicating ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Ionicons name="copy-outline" size={21} color={colors.onSurface} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                testID="edit-program-btn"
                onPress={() => router.push({ pathname: "/program-editor", params: { id: program.id } })}
                style={styles.iconBtn}
              >
                <Ionicons name="create-outline" size={22} color={colors.onSurface} />
              </TouchableOpacity>
              <TouchableOpacity testID="delete-program-btn" onPress={confirmDelete} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={20} color={colors.onSurfaceSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.heroContent}>
          <View style={[styles.catBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.catBadgeText, { color: meta.color }]}>
              {meta.emoji} {program.category.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.title}>{program.name}</Text>
          <Text style={styles.meta}>
            {formatWeeks(program.total_days)} · {program.days_per_week} days/week ·{" "}
            {program.difficulty}
          </Text>
        </View>

        {program.description ? <Text style={styles.description}>{program.description}</Text> : null}

        {program.spotify_url ? (
          <TouchableOpacity
            style={styles.spotifyRow}
            onPress={() => Linking.openURL(program.spotify_url!)}
            activeOpacity={0.8}
          >
            <Ionicons name="musical-notes" size={18} color={colors.success} />
            <Text style={styles.spotifyText}>Program playlist</Text>
            <Ionicons name="open-outline" size={15} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>
        ) : null}

        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekBlock}>
            <Text style={styles.weekTitle}>WEEK {wi + 1}</Text>
            {week.map((d) => {
              const isToday = program.enrollment?.active && d.day === currentDay;
              const done = program.enrollment?.active && d.day < currentDay;
              const isRest = !d.session_id;
              const row = (
                <View
                  key={d.day}
                  style={[styles.dayRowInner, isToday && styles.dayRowActive]}
                >
                  <View style={styles.dayIcon}>
                    <Ionicons
                      name={(sessionTypeIcon[d.session_type] as any) || "barbell"}
                      size={18}
                      color={done ? colors.success : isToday ? colors.brand : colors.onSurfaceSecondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dayName, isRest && { color: colors.onSurfaceSecondary }]}>
                      {d.session_name}
                    </Text>
                    <Text style={styles.daySub}>
                      Day {d.day}
                      {d.target_minutes > 0 ? ` · ${d.target_minutes} min` : ""}
                    </Text>
                  </View>
                  {done ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  ) : !isRest ? (
                    <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
                  ) : null}
                </View>
              );
              if (isRest) return row;
              return (
                <TouchableOpacity
                  key={d.day}
                  testID={`schedule-day-${d.day}`}
                  activeOpacity={0.7}
                  onPress={() =>
                    router.push({
                      pathname: "/session/[id]",
                      params: { id: d.session_id!, programId: program.id },
                    })
                  }
                >
                  {row}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        {isOwner ? (
          <Button
            testID="assign-from-program-btn"
            title="Assign to a Client"
            onPress={() => router.push("/(tabs)/clients")}
          />
        ) : program.enrollment?.active ? (
          <Button
            testID="continue-program-btn"
            title={`Continue — Day ${currentDay} of ${program.total_days}`}
            onPress={() => {
              const today = program.schedule.find((d) => d.day === currentDay);
              if (today?.session_id) {
                router.push({
                  pathname: "/session/[id]",
                  params: { id: today.session_id, programId: program.id },
                });
              }
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function formatWeeks(days: number): string {
  const w = Math.ceil(days / 7);
  return `${w} week${w === 1 ? "" : "s"}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  heroContent: { paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  catBadge: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  catBadgeText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8 },
  title: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.onSurface, marginTop: spacing.sm },
  meta: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 4, textTransform: "capitalize" },
  description: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceTertiary,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  spotifyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 48,
  },
  spotifyText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurface },
  weekBlock: { marginTop: spacing.xl, paddingHorizontal: spacing.xl },
  weekTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.brand, letterSpacing: 1.2, marginBottom: spacing.sm },
  dayRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 56,
  },
  dayRowActive: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0,
  },
  dayIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  dayName: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.onSurface },
  daySub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
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
});
