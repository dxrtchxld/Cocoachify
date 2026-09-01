import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import Scrim from "@/src/components/Scrim";
import Segmented from "@/src/components/Segmented";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { categoryMeta, colors, coverFor, fonts, radius, sessionTypeIcon, spacing } from "@/src/theme";

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
  cover_image: string | null;
  owner_id: string | null;
  schedule: ScheduleDay[];
  enrollment: { current_day: number; active: boolean } | null;
};

const HERO_H = 300;

export default function ProgramScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [view, setView] = useState<"week" | "list" | "calendar">("week");
  const [selectedDay, setSelectedDay] = useState<ScheduleDay | null>(null);

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

  const openSession = (d: ScheduleDay) => {
    if (!d.session_id) return;
    setSelectedDay(null);
    router.push({ pathname: "/session/[id]", params: { id: d.session_id, programId: program!.id } });
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
        <Text style={{ color: colors.onSurfaceSecondary, fontFamily: fonts.medium }}>Program not found.</Text>
      </View>
    );
  }

  const meta = categoryMeta[program.category] ?? categoryMeta.fitness;
  const currentDay = program.enrollment?.current_day ?? 0;
  const active = program.enrollment?.active;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={{ uri: coverFor(program.category, program.cover_image) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={250}
          />
          <Scrim />
          <View style={[styles.heroHeader, { paddingTop: insets.top + spacing.sm }]}>
            <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.glassBtn}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            {isOwner && (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TouchableOpacity testID="duplicate-program-btn" onPress={duplicate} style={styles.glassBtn} disabled={duplicating}>
                  {duplicating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="copy-outline" size={19} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  testID="edit-program-btn"
                  onPress={() => router.push({ pathname: "/program-editor", params: { id: program.id } })}
                  style={styles.glassBtn}
                >
                  <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity testID="delete-program-btn" onPress={confirmDelete} style={styles.glassBtn}>
                  <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={styles.heroBottom}>
            <View style={[styles.catBadge, { backgroundColor: meta.bg, flexDirection: "row", alignItems: "center", gap: 4 }]}>
              <Ionicons name={meta.icon as any} size={11} color={meta.color} />
              <Text style={[styles.catBadgeText, { color: meta.color }]}>
                {program.category.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.title}>{program.name}</Text>
            <Text style={styles.metaLine}>
              {formatWeeks(program.total_days)}  ·  {program.days_per_week}×/week  ·  {program.difficulty}
            </Text>
          </View>
        </View>

        {program.description ? <Text style={styles.description}>{program.description}</Text> : null}

        {program.spotify_url ? (
          <TouchableOpacity
            style={styles.spotifyRow}
            onPress={() => Linking.openURL(program.spotify_url!)}
            activeOpacity={0.85}
          >
            <Ionicons name="musical-notes" size={18} color={colors.success} />
            <Text style={styles.spotifyText}>Program playlist</Text>
            <Ionicons name="open-outline" size={15} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>
        ) : null}

        {/* Layout switcher */}
        <View style={styles.switcher}>
          <Segmented
            testIDPrefix="layout"
            value={view}
            onChange={(v) => setView(v as any)}
            options={[
              { key: "week", label: "Week" },
              { key: "list", label: "List" },
              { key: "calendar", label: "Calendar" },
            ]}
          />
        </View>

        {view === "week" && <WeekView program={program} currentDay={currentDay} active={active} onOpen={openSession} />}
        {view === "list" && <ListView program={program} currentDay={currentDay} active={active} onOpen={openSession} />}
        {view === "calendar" && (
          <CalendarView program={program} currentDay={currentDay} active={active} onSelect={setSelectedDay} />
        )}
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        {isOwner ? (
          <Button
            testID="assign-from-program-btn"
            title="Assign to a Client"
            onPress={() => router.push("/(tabs)/clients")}
          />
        ) : active ? (
          <Button
            testID="continue-program-btn"
            title={`Continue — Day ${currentDay} of ${program.total_days}`}
            onPress={() => {
              const today = program.schedule.find((d) => d.day === currentDay);
              if (today?.session_id) openSession(today);
            }}
          />
        ) : null}
      </View>

      {/* Calendar day preview sheet */}
      <Modal visible={!!selectedDay} transparent animationType="slide" onRequestClose={() => setSelectedDay(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedDay(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            {selectedDay && (
              <>
                <Text style={styles.sheetKicker}>DAY {selectedDay.day}</Text>
                <Text style={styles.sheetTitle}>{selectedDay.session_name}</Text>
                <Text style={styles.sheetMeta}>
                  {selectedDay.session_id
                    ? `${selectedDay.session_type} · ${selectedDay.target_minutes || 0} min`
                    : "Recovery day — rest, hydrate, sleep well."}
                </Text>
                {selectedDay.session_id && (
                  <Button
                    testID="open-session-from-cal"
                    title="Open Session"
                    onPress={() => openSession(selectedDay)}
                    style={{ marginTop: spacing.lg }}
                  />
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------- Views ---------- */

function DayRow({
  d,
  currentDay,
  active,
  onOpen,
}: {
  d: ScheduleDay;
  currentDay: number;
  active?: boolean;
  onOpen: (d: ScheduleDay) => void;
}) {
  const isToday = active && d.day === currentDay;
  const done = active && d.day < currentDay;
  const isRest = !d.session_id;
  const body = (
    <View style={[styles.dayRow, isToday && styles.dayRowActive]}>
      <View style={[styles.dayIcon, isToday && { backgroundColor: colors.brand }]}>
        <Ionicons
          name={(sessionTypeIcon[d.session_type] as any) || "barbell"}
          size={17}
          color={isToday ? colors.onBrand : done ? colors.success : isRest ? colors.onSurfaceSecondary : colors.brand}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.dayName, isRest && { color: colors.onSurfaceSecondary }]} numberOfLines={1}>
          {d.session_name}
        </Text>
        <Text style={styles.daySub}>
          Day {d.day}
          {d.target_minutes > 0 ? `  ·  ${d.target_minutes} min` : ""}
          {isToday ? "  ·  Today" : ""}
        </Text>
      </View>
      {done ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
      ) : !isRest ? (
        <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
      ) : (
        <Ionicons name="moon" size={15} color={colors.onSurfaceSecondary} />
      )}
    </View>
  );
  if (isRest) return body;
  return (
    <TouchableOpacity testID={`schedule-day-${d.day}`} activeOpacity={0.75} onPress={() => onOpen(d)}>
      {body}
    </TouchableOpacity>
  );
}

function WeekView({ program, currentDay, active, onOpen }: any) {
  const weeks: ScheduleDay[][] = [];
  for (let i = 0; i < program.schedule.length; i += 7) weeks.push(program.schedule.slice(i, i + 7));
  return (
    <View style={{ paddingHorizontal: spacing.xl }}>
      {weeks.map((week, wi) => {
        const training = week.filter((d) => d.session_id).length;
        return (
          <View key={wi} style={styles.weekCard}>
            <View style={styles.weekHead}>
              <Text style={styles.weekTitle}>WEEK {wi + 1}</Text>
              <Text style={styles.weekCount}>{training} sessions</Text>
            </View>
            {week.map((d) => (
              <DayRow key={d.day} d={d} currentDay={currentDay} active={active} onOpen={onOpen} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function ListView({ program, currentDay, active, onOpen }: any) {
  return (
    <View style={styles.listCard}>
      {program.schedule.map((d: ScheduleDay) => (
        <DayRow key={d.day} d={d} currentDay={currentDay} active={active} onOpen={onOpen} />
      ))}
    </View>
  );
}

function CalendarView({ program, currentDay, active, onSelect }: any) {
  const schedule: ScheduleDay[] = program.schedule;
  const weeks: ScheduleDay[][] = [];
  for (let i = 0; i < schedule.length; i += 7) weeks.push(schedule.slice(i, i + 7));
  return (
    <View style={{ paddingHorizontal: spacing.xl }}>
      <View style={styles.calLegendRow}>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.brand }]} /><Text style={styles.legendText}>Session</Text></View>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.borderStrong }]} /><Text style={styles.legendText}>Rest</Text></View>
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.calWeek}>
          {week.map((d) => {
            const isToday = active && d.day === currentDay;
            const done = active && d.day < currentDay;
            const training = !!d.session_id;
            return (
              <TouchableOpacity
                key={d.day}
                testID={`cal-day-${d.day}`}
                style={[
                  styles.calCell,
                  isToday && { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
                ]}
                activeOpacity={0.8}
                onPress={() => onSelect(d)}
              >
                <Text style={[styles.calDayNum, isToday && { color: colors.brand }]}>{d.day}</Text>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: done ? colors.success : training ? colors.brand : colors.borderStrong },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
          {week.length < 7 &&
            Array.from({ length: 7 - week.length }).map((_, k) => <View key={`e${k}`} style={styles.calCellEmpty} />)}
        </View>
      ))}
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
  hero: { height: HERO_H, backgroundColor: colors.surfaceSecondary, justifyContent: "space-between" },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  glassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBottom: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  catBadge: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  catBadgeText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8 },
  title: { fontFamily: fonts.displayBold, fontSize: 30, color: "#FFFFFF", marginTop: spacing.sm, lineHeight: 33 },
  metaLine: { fontFamily: fonts.semiBold, fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 6, textTransform: "capitalize" },
  description: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.onSurfaceTertiary,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
  spotifyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 48,
  },
  spotifyText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurface },
  switcher: { paddingHorizontal: spacing.xl, marginTop: spacing.xl, marginBottom: spacing.md },
  weekCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  weekHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  weekTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.brand, letterSpacing: 1.4 },
  weekCount: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.onSurfaceSecondary },
  listCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 58,
  },
  dayRowActive: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0,
    marginVertical: 3,
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
  calLegendRow: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontFamily: fonts.medium, fontSize: 11, color: colors.onSurfaceSecondary },
  dot: { width: 7, height: 7, borderRadius: 4 },
  calWeek: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  calCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  calCellEmpty: { flex: 1, aspectRatio: 1 },
  calDayNum: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceTertiary },
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.lg },
  sheetKicker: { fontFamily: fonts.bold, fontSize: 11, color: colors.brand, letterSpacing: 1.5 },
  sheetTitle: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, marginTop: 4 },
  sheetMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 6, textTransform: "capitalize" },
});
