import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Exercise = {
  name: string;
  block_label: string;
  sets: number | null;
  reps: string | null;
  duration_seconds: number | null;
  rest_seconds: number | null;
  form_note: string | null;
  purpose_note: string | null;
};

const TYPES = ["workout", "yoga", "breathwork", "mobility", "mindfulness", "recovery"];

const emptyExercise: Exercise = {
  name: "",
  block_label: "",
  sets: null,
  reps: null,
  duration_seconds: null,
  rest_seconds: null,
  form_note: null,
  purpose_note: null,
};

export default function SessionEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const isEdit = !!id;

  const [name, setName] = useState("");
  const [sessionType, setSessionType] = useState("workout");
  const [minutes, setMinutes] = useState("45");
  const [coachNotes, setCoachNotes] = useState("");
  const [warmup, setWarmup] = useState("");
  const [finisher, setFinisher] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exercise form modal
  const [formIndex, setFormIndex] = useState<number | null>(null); // -1 = new
  const [draft, setDraft] = useState<Exercise>(emptyExercise);
  const [draftSets, setDraftSets] = useState("");
  const [draftRest, setDraftRest] = useState("");

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const s = await api<any>(`/sessions/${id}`);
        setName(s.name);
        setSessionType(s.session_type ?? "workout");
        setMinutes(String(s.target_minutes ?? 45));
        setCoachNotes(s.coach_notes ?? "");
        setWarmup(s.warmup_notes ?? "");
        setFinisher(s.finisher_notes ?? "");
        setExercises(s.exercises ?? []);
      } catch {
        setError("Couldn't load session.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const openForm = (index: number) => {
    if (index === -1) {
      const lastBlock = exercises.length > 0 ? exercises[exercises.length - 1].block_label : "";
      setDraft({ ...emptyExercise, block_label: lastBlock });
      setDraftSets("");
      setDraftRest("");
    } else {
      const e = exercises[index];
      setDraft({ ...e });
      setDraftSets(e.sets ? String(e.sets) : "");
      setDraftRest(e.rest_seconds != null ? String(e.rest_seconds) : "");
    }
    setFormIndex(index);
  };

  const saveExercise = () => {
    if (!draft.name.trim()) return;
    const ex: Exercise = {
      ...draft,
      name: draft.name.trim(),
      block_label: draft.block_label.trim(),
      sets: draftSets ? parseInt(draftSets, 10) || null : null,
      rest_seconds: draftRest ? parseInt(draftRest, 10) || null : null,
      reps: draft.reps?.trim() || null,
      form_note: draft.form_note?.trim() || null,
      purpose_note: draft.purpose_note?.trim() || null,
    };
    setExercises((prev) => {
      if (formIndex === -1) return [...prev, ex];
      const next = [...prev];
      next[formIndex!] = ex;
      return next;
    });
    setFormIndex(null);
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    setExercises((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Give your session a name.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        session_type: sessionType,
        target_minutes: parseInt(minutes, 10) || 0,
        coach_notes: coachNotes.trim(),
        warmup_notes: warmup.trim(),
        finisher_notes: finisher.trim(),
        exercises,
      };
      if (isEdit) {
        await api(`/sessions/${id}`, { method: "PUT", body });
      } else {
        await api("/sessions", { method: "POST", body });
      }
      router.back();
    } catch (e: any) {
      setError(e?.message || "Couldn't save session.");
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

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
            </TouchableOpacity>
            <Text style={styles.title}>{isEdit ? "EDIT SESSION" : "NEW SESSION"}</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Session name *</Text>
            <TextInput
              testID="session-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Week 1 Day 1 — Rowing Strength & Power"
              placeholderTextColor={colors.onSurfaceSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipWrap}>
              {TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  testID={`stype-${t}`}
                  style={[styles.chip, sessionType === t && styles.chipActive]}
                  onPress={() => setSessionType(t)}
                >
                  <Text style={[styles.chipText, sessionType === t && styles.chipTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Target minutes</Text>
            <TextInput
              testID="session-minutes-input"
              style={[styles.input, { maxWidth: 120 }]}
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              placeholder="45"
              placeholderTextColor={colors.onSurfaceSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Coach notes (shown to client)</Text>
            <TextInput
              testID="session-notes-input"
              style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
              value={coachNotes}
              onChangeText={setCoachNotes}
              placeholder="Intent for the day, effort targets, reminders..."
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Warm-up</Text>
            <TextInput
              style={[styles.input, { minHeight: 56, textAlignVertical: "top" }]}
              value={warmup}
              onChangeText={setWarmup}
              placeholder="e.g. 5 min easy row, hip openers..."
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
            />
          </View>

          {/* Exercises */}
          <View style={styles.field}>
            <Text style={styles.label}>Exercises ({exercises.length})</Text>
            {exercises.map((e, i) => (
              <View key={i} style={styles.exRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.exNameRow}>
                    <Text style={styles.exName}>{e.name}</Text>
                    {e.block_label ? (
                      <View style={styles.blockChip}>
                        <Text style={styles.blockChipText}>{e.block_label.toUpperCase()}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.exScheme}>
                    {e.sets ? `${e.sets} sets` : ""}
                    {e.reps ? ` × ${e.reps}` : ""}
                    {e.rest_seconds ? ` · rest ${e.rest_seconds}s` : ""}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => move(i, -1)} style={styles.iconBtn} hitSlop={8}>
                  <Ionicons name="chevron-up" size={17} color={colors.onSurfaceSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(i, 1)} style={styles.iconBtn} hitSlop={8}>
                  <Ionicons name="chevron-down" size={17} color={colors.onSurfaceSecondary} />
                </TouchableOpacity>
                <TouchableOpacity testID={`edit-ex-${i}`} onPress={() => openForm(i)} style={styles.iconBtn} hitSlop={8}>
                  <Ionicons name="create-outline" size={18} color={colors.brand} />
                </TouchableOpacity>
                <TouchableOpacity testID={`delete-ex-${i}`} onPress={() => removeExercise(i)} style={styles.iconBtn} hitSlop={8}>
                  <Ionicons name="trash-outline" size={17} color={colors.onSurfaceSecondary} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity testID="add-exercise-btn" style={styles.addExBtn} onPress={() => openForm(-1)}>
              <Ionicons name="add-circle" size={20} color={colors.brand} />
              <Text style={styles.addExText}>Add exercise</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Finisher</Text>
            <TextInput
              style={[styles.input, { minHeight: 56, textAlignVertical: "top" }]}
              value={finisher}
              onChangeText={setFinisher}
              placeholder="e.g. Easy 500m paddle cool-down..."
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          testID="save-session-btn"
          title={isEdit ? "Save Changes" : "Create Session"}
          onPress={save}
          loading={saving}
        />
      </View>

      {/* Exercise form modal */}
      <Modal visible={formIndex !== null} transparent animationType="slide" onRequestClose={() => setFormIndex(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setFormIndex(null)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>{formIndex === -1 ? "ADD EXERCISE" : "EDIT EXERCISE"}</Text>
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Exercise name *</Text>
              <TextInput
                testID="ex-name-input"
                style={styles.input}
                value={draft.name}
                onChangeText={(v) => setDraft({ ...draft, name: v })}
                placeholder="e.g. Romanian Deadlift"
                placeholderTextColor={colors.onSurfaceSecondary}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Block (e.g. Power, Superset A)</Text>
              <TextInput
                testID="ex-block-input"
                style={styles.input}
                value={draft.block_label}
                onChangeText={(v) => setDraft({ ...draft, block_label: v })}
                placeholder="Optional — groups exercises together"
                placeholderTextColor={colors.onSurfaceSecondary}
              />
              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Sets</Text>
                  <TextInput
                    testID="ex-sets-input"
                    style={styles.input}
                    value={draftSets}
                    onChangeText={setDraftSets}
                    keyboardType="number-pad"
                    placeholder="3"
                    placeholderTextColor={colors.onSurfaceSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Reps / time</Text>
                  <TextInput
                    testID="ex-reps-input"
                    style={styles.input}
                    value={draft.reps ?? ""}
                    onChangeText={(v) => setDraft({ ...draft, reps: v })}
                    placeholder="8 or 30s"
                    placeholderTextColor={colors.onSurfaceSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Rest (s)</Text>
                  <TextInput
                    testID="ex-rest-input"
                    style={styles.input}
                    value={draftRest}
                    onChangeText={setDraftRest}
                    keyboardType="number-pad"
                    placeholder="90"
                    placeholderTextColor={colors.onSurfaceSecondary}
                  />
                </View>
              </View>
              <Text style={[styles.label, { marginTop: spacing.md }]}>Form cue</Text>
              <TextInput
                testID="ex-form-input"
                style={styles.input}
                value={draft.form_note ?? ""}
                onChangeText={(v) => setDraft({ ...draft, form_note: v })}
                placeholder="e.g. Hinge at hips; maintain a flat back"
                placeholderTextColor={colors.onSurfaceSecondary}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Purpose</Text>
              <TextInput
                testID="ex-purpose-input"
                style={styles.input}
                value={draft.purpose_note ?? ""}
                onChangeText={(v) => setDraft({ ...draft, purpose_note: v })}
                placeholder="e.g. Strengthens the posterior chain"
                placeholderTextColor={colors.onSurfaceSecondary}
              />
            </ScrollView>
            <Button
              testID="save-exercise-btn"
              title={formIndex === -1 ? "Add Exercise" : "Save Exercise"}
              onPress={saveExercise}
              disabled={!draft.name.trim()}
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
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface, letterSpacing: 1 },
  field: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
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
    backgroundColor: colors.surfaceSecondary,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  chipText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onSurface },
  exRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 56,
  },
  exNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  exName: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurface },
  blockChip: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  blockChipText: { fontFamily: fonts.bold, fontSize: 9, color: colors.onBrandTertiary, letterSpacing: 0.8 },
  exScheme: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.brandSecondary, marginTop: 2 },
  iconBtn: { width: 34, height: 44, alignItems: "center", justifyContent: "center" },
  addExBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 52,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: "dashed",
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  addExText: { fontFamily: fonts.bold, fontSize: 14, color: colors.brand },
  errorText: { fontFamily: fonts.medium, fontSize: 13, color: colors.error, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
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
  modalTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
});
