import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, fonts, radius, spacing } from "../../theme";

export type PlayerExercise = {
  name: string;
  block_label: string;
  sets: number | null;
  reps: string | null;
  duration_seconds: number | null;
  rest_seconds: number | null;
  form_note: string | null;
  purpose_note: string | null;
};

function tap() {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

function RestTimer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const start = () => {
    tap();
    if (timer.current) clearInterval(timer.current);
    setLeft(seconds);
    timer.current = setInterval(() => {
      setLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (timer.current) clearInterval(timer.current);
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const running = left !== null;
  return (
    <TouchableOpacity
      testID="rest-timer-btn"
      style={[s.restBtn, running && s.restBtnActive]}
      onPress={start}
      activeOpacity={0.85}
    >
      <Ionicons name={running ? "timer" : "timer-outline"} size={14} color={running ? colors.onBrand : colors.brand} />
      <Text style={[s.restText, running && { color: colors.onBrand }]}>
        {running ? `${left}s` : `Rest ${seconds}s`}
      </Text>
    </TouchableOpacity>
  );
}

export default function ExerciseBlock({
  exercise,
  number,
  setsDone,
  onSetTap,
  onToggleAll,
}: {
  exercise: PlayerExercise;
  number: number;
  setsDone: number;
  onSetTap: (next: number) => void;
  onToggleAll: () => void;
}) {
  const totalSets = exercise.sets && exercise.sets > 0 ? exercise.sets : 1;
  const complete = setsDone >= totalSets;

  const scheme = [
    exercise.sets ? `${exercise.sets} sets` : null,
    exercise.reps ? `${exercise.reps} reps` : null,
    !exercise.reps && exercise.duration_seconds
      ? exercise.duration_seconds >= 60
        ? `${Math.round(exercise.duration_seconds / 60)} min`
        : `${exercise.duration_seconds}s`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View testID={`exercise-block-${number}`} style={[s.card, complete && s.cardDone]}>
      <View style={s.topRow}>
        <TouchableOpacity
          testID={`exercise-check-${number}`}
          style={[s.check, complete && s.checkDone]}
          onPress={() => {
            tap();
            onToggleAll();
          }}
        >
          {complete ? (
            <Ionicons name="checkmark" size={18} color={colors.onBrand} />
          ) : (
            <Text style={s.checkNum}>{number}</Text>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.name, complete && s.nameDone]}>{exercise.name}</Text>
          {scheme ? <Text style={s.scheme}>{scheme}</Text> : null}
        </View>
      </View>

      {totalSets > 1 ? (
        <View style={s.setsRow}>
          {Array.from({ length: totalSets }).map((_, i) => {
            const filled = i < setsDone;
            return (
              <TouchableOpacity
                key={i}
                testID={`set-dot-${number}-${i + 1}`}
                style={[s.setDot, filled && s.setDotFilled]}
                onPress={() => {
                  tap();
                  onSetTap(filled && i === setsDone - 1 ? i : i + 1);
                }}
              >
                <Text style={[s.setDotText, filled && { color: colors.onBrand }]}>{i + 1}</Text>
              </TouchableOpacity>
            );
          })}
          {exercise.rest_seconds ? <RestTimer seconds={exercise.rest_seconds} /> : null}
        </View>
      ) : exercise.rest_seconds ? (
        <View style={s.setsRow}>
          <RestTimer seconds={exercise.rest_seconds} />
        </View>
      ) : null}

      {exercise.form_note ? (
        <View style={[s.note, s.noteForm]}>
          <View style={s.noteHead}>
            <Ionicons name="body" size={13} color={colors.brand} />
            <Text style={s.noteLabelForm}>FORM</Text>
          </View>
          <Text style={s.noteBody}>{exercise.form_note}</Text>
        </View>
      ) : null}

      {exercise.purpose_note ? (
        <View style={[s.note, s.notePurpose]}>
          <View style={s.noteHead}>
            <Ionicons name="bulb" size={13} color={colors.success} />
            <Text style={s.noteLabelPurpose}>WHY IT MATTERS</Text>
          </View>
          <Text style={s.noteBody}>{exercise.purpose_note}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardDone: { borderColor: colors.brandSecondary, backgroundColor: "#12110D" },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  check: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkNum: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.onSurfaceSecondary },
  name: { fontFamily: fonts.displayBold, fontSize: 19, color: colors.onSurface, letterSpacing: 0.2 },
  nameDone: { color: colors.onSurfaceTertiary },
  scheme: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.brandSecondary, marginTop: 3, letterSpacing: 0.3 },
  setsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  setDot: {
    width: 44,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  setDotFilled: { backgroundColor: colors.brand, borderColor: colors.brand },
  setDotText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onSurfaceSecondary },
  restBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  restBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  restText: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.brand, letterSpacing: 0.6 },
  note: { borderRadius: radius.md, padding: spacing.md, gap: 4 },
  noteForm: { backgroundColor: colors.brandTertiary },
  notePurpose: { backgroundColor: "rgba(34,197,94,0.10)" },
  noteHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  noteLabelForm: { fontFamily: fonts.bold, fontSize: 9.5, color: colors.brand, letterSpacing: 1.2 },
  noteLabelPurpose: { fontFamily: fonts.bold, fontSize: 9.5, color: colors.success, letterSpacing: 1.2 },
  noteBody: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, color: colors.onSurfaceTertiary },
});
