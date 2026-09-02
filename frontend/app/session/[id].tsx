import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import ExerciseBlock from "@/src/components/player/ExerciseBlock";
import PlayerHero from "@/src/components/player/PlayerHero";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type SessionExercise = {
  name: string;
  block_label: string;
  sets: number | null;
  reps: string | null;
  duration_seconds: number | null;
  rest_seconds: number | null;
  form_note: string | null;
  purpose_note: string | null;
};

type SessionDetail = {
  id: string;
  name: string;
  session_type: string;
  target_minutes: number;
  warmup_notes: string;
  finisher_notes: string;
  coach_notes: string;
  owner_id: string;
  exercises: SessionExercise[];
};

export default function SessionScreen() {
  const { id, programId } = useLocalSearchParams<{ id: string; programId?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [duration, setDuration] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [setsDone, setSetsDone] = useState<Record<number, number>>({});

  const isClient = user?.role === "client";
  const isOwner = user?.role === "coach" && session?.owner_id === user.user_id;

  const load = useCallback(async () => {
    try {
      const s = await api<SessionDetail>(`/sessions/${id}`);
      setSession(s);
      setDuration(s.target_minutes ? String(s.target_minutes) : "0");
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const submitLog = async () => {
    if (!session) return;
    setSaving(true);
    try {
      await api("/logs", {
        method: "POST",
        body: {
          log_type: "workout",
          session_id: session.id,
          program_id: programId || null,
          duration_minutes: parseInt(duration, 10) || 0,
          rpe,
          notes: notes.trim() || null,
        },
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setSaved(true);
      setLogOpen(false);
      setTimeout(() => router.back(), 900);
    } catch {
      // keep modal open
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.onSurfaceSecondary, fontFamily: fonts.medium }}>Session not found.</Text>
      </View>
    );
  }

  // Group consecutive exercises by block label
  const groups: { label: string; items: { ex: SessionExercise; index: number }[] }[] = [];
  session.exercises.forEach((ex, index) => {
    const label = ex.block_label || "";
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push({ ex, index });
    } else {
      groups.push({ label, items: [{ ex, index }] });
    }
  });

  const totalExercises = session.exercises.length;
  const doneCount = session.exercises.filter(
    (ex, i) => (setsDone[i] ?? 0) >= Math.max(1, ex.sets ?? 1),
  ).length;
  const donePct = totalExercises ? Math.round((doneCount / totalExercises) * 100) : 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 132 + insets.bottom }}>
        <PlayerHero
          title={session.name}
          sessionType={session.session_type}
          minutes={session.target_minutes}
          exerciseCount={totalExercises}
          blockCount={groups.length}
        />

        {isClient && totalExercises > 0 ? (
          <View style={styles.progressCard}>
            <View style={styles.progressTop}>
              <Text style={styles.progressLabel}>TODAY’S WORK</Text>
              <Text style={styles.progressCount}>
                {doneCount}/{totalExercises}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${donePct}%` }]} />
            </View>
          </View>
        ) : null}

        {session.coach_notes ? (
          <View style={styles.noteCard}>
            <View style={styles.noteHeader}>
              <Ionicons name="chatbubble-ellipses" size={16} color={colors.brand} />
              <Text style={styles.noteTitle}>COACH NOTES</Text>
            </View>
            <Text style={styles.noteBody}>{session.coach_notes}</Text>
          </View>
        ) : null}

        {session.warmup_notes ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>WARM-UP</Text>
            <Text style={styles.blockBody}>{session.warmup_notes}</Text>
          </View>
        ) : null}

        {groups.map((group, gi) => (
          <View key={gi} style={styles.blockGroup}>
            {group.label ? (
              <View style={styles.blockLabelChip}>
                <Text style={styles.blockLabelText}>{group.label.toUpperCase()}</Text>
              </View>
            ) : session.exercises.length > 0 ? (
              <Text style={styles.blockTitle}>THE WORK</Text>
            ) : null}
            {group.items.map(({ ex, index }, ei) => (
              <ExerciseBlock
                key={index}
                exercise={ex}
                number={ei + 1}
                setsDone={setsDone[index] ?? 0}
                onSetTap={(next) => setSetsDone((prev) => ({ ...prev, [index]: next }))}
                onToggleAll={() =>
                  setSetsDone((prev) => {
                    const total = Math.max(1, ex.sets ?? 1);
                    const current = prev[index] ?? 0;
                    return { ...prev, [index]: current >= total ? 0 : total };
                  })
                }
              />
            ))}
          </View>
        ))}

        {session.finisher_notes ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>FINISHER</Text>
            <Text style={styles.blockBody}>{session.finisher_notes}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        {saved ? (
          <View style={styles.savedRow}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <Text style={styles.savedText}>Checked in! Nice work.</Text>
          </View>
        ) : isClient ? (
          <Button
            testID="complete-log-btn"
            title={
              totalExercises && doneCount < totalExercises
                ? `Complete & Check In · ${doneCount}/${totalExercises}`
                : "Complete & Check In"
            }
            onPress={() => setLogOpen(true)}
          />
        ) : isOwner ? (
          <Button
            testID="edit-session-btn"
            title="Edit Session"
            variant="secondary"
            onPress={() => router.push({ pathname: "/session-editor", params: { id: session.id } })}
          />
        ) : null}
      </View>

      {/* Check-in modal */}
      <Modal visible={logOpen} transparent animationType="slide" onRequestClose={() => setLogOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setLogOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>DAILY CHECK-IN</Text>

            <Text style={styles.fieldLabel}>Duration (minutes)</Text>
            <TextInput
              testID="duration-input"
              style={styles.input}
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
              placeholder="45"
              placeholderTextColor={colors.onSurfaceSecondary}
            />

            <Text style={styles.fieldLabel}>How hard was it? (RPE)</Text>
            <View style={styles.rpeRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <TouchableOpacity
                  key={n}
                  testID={`rpe-${n}`}
                  style={[styles.rpeChip, rpe === n && styles.rpeChipActive]}
                  onPress={() => {
                    setRpe(n);
                    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                  }}
                >
                  <Text style={[styles.rpeText, rpe === n && styles.rpeTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Notes for your coach</Text>
            <TextInput
              testID="notes-input"
              style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="PRs, how it felt, anything your coach should know..."
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
            />

            <Button
              testID="save-log-btn"
              title="Submit Check-In"
              onPress={submitLog}
              loading={saving}
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
  progressCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  progressTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressLabel: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.onSurfaceSecondary, letterSpacing: 1.4 },
  progressCount: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.brand },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  noteCard: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  noteHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  noteTitle: { fontFamily: fonts.bold, fontSize: 11, color: colors.onBrandTertiary, letterSpacing: 1 },
  noteBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.onSurface },
  block: { marginTop: spacing.xl, paddingHorizontal: spacing.xl },
  blockTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.brand, letterSpacing: 1.2, marginBottom: spacing.sm },
  blockBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary },
  blockGroup: { marginTop: spacing.xl, paddingHorizontal: spacing.xl },
  blockLabelChip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  blockLabelText: { fontFamily: fonts.bold, fontSize: 11, color: colors.brandSecondary, letterSpacing: 1.2 },
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
  savedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 52 },
  savedText: { fontFamily: fonts.bold, fontSize: 16, color: colors.success },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface, marginBottom: spacing.lg },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
  rpeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rpeChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  rpeChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  rpeText: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurfaceSecondary },
  rpeTextActive: { color: colors.onBrand },
});
