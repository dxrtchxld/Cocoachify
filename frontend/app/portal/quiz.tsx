/** Client-facing quiz: take a lesson's quiz and see graded results. Reached
 * from the lesson screen via "Take Quiz". Grading always happens server-side —
 * this screen never knows the correct answers until results come back. */
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import { Card, Loading, ScreenHeader } from "@/src/components/studio/UI";
import { api, ApiError } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type QType = "multiple_choice" | "true_false" | "short_answer";
type Question = { id: string; type: QType; question: string; options: string[] };
type ResultItem = { question_id: string; correct: boolean; correct_index: number | null; correct_text: string | null; explanation: string };

export default function TakeQuizScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [result, setResult] = useState<{ score: number; total: number; results: ResultItem[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers({});
    try {
      const res = await api<{ lesson_title: string; questions: Question[] }>(`/lessons/${lessonId}/quiz/take`);
      setLessonTitle(res.lesson_title);
      setQuestions(res.questions);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this quiz");
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        answers: questions.map((q) => ({ question_id: q.id, answer: answers[q.id] ?? null })),
      };
      const res = await api<{ score: number; total: number; results: ResultItem[] }>(
        `/lessons/${lessonId}/quiz/submit`,
        { method: "POST", body: payload },
      );
      setResult(res);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : "Couldn't submit your answers");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Quiz" />
        <Loading />
      </View>
    );
  }

  if (result) {
    const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
    return (
      <View style={styles.container}>
        <ScreenHeader title={lessonTitle} subtitle="Quiz results" />
        <ScrollView contentContainerStyle={styles.body}>
          <Card style={styles.scoreCard}>
            <Text style={styles.scoreText}>
              {result.score}/{result.total}
            </Text>
            <Text style={styles.scorePct}>{pct}% correct</Text>
          </Card>
          {questions.map((q, idx) => {
            const r = result.results.find((x) => x.question_id === q.id);
            return (
              <Card key={q.id} style={{ gap: spacing.sm }}>
                <View style={styles.resultHeader}>
                  <Ionicons
                    name={r?.correct ? "checkmark-circle" : "close-circle"}
                    size={18}
                    color={r?.correct ? colors.success : colors.error}
                  />
                  <Text style={styles.qText}>{q.question}</Text>
                </View>
                {!r?.correct ? (
                  <Text style={styles.correctAnswer}>
                    Correct answer: {q.type === "short_answer" ? r?.correct_text : q.options[r?.correct_index ?? -1]}
                  </Text>
                ) : null}
                {r?.explanation ? <Text style={styles.explanation}>{r.explanation}</Text> : null}
              </Card>
            );
          })}
          <Button testID="retake-quiz-btn" title="Retake quiz" variant="secondary" onPress={load} />
          <Button testID="quiz-done-btn" title="Done" onPress={() => router.back()} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={lessonTitle} subtitle={`${questions.length} question${questions.length === 1 ? "" : "s"}`} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {questions.map((q, idx) => (
          <Card key={q.id} style={{ gap: spacing.md }}>
            <Text style={styles.qLabel}>QUESTION {idx + 1}</Text>
            <Text style={styles.qText}>{q.question}</Text>
            {q.type === "short_answer" ? (
              <TextInput
                testID={`answer-input-${q.id}`}
                style={styles.textInput}
                value={String(answers[q.id] ?? "")}
                onChangeText={(t) => setAnswers((a) => ({ ...a, [q.id]: t }))}
                placeholder="Your answer"
                placeholderTextColor={colors.onSurfaceSecondary}
              />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {q.options.map((opt, i) => {
                  const active = answers[q.id] === i;
                  return (
                    <TouchableOpacity
                      key={i}
                      testID={`answer-option-${q.id}-${i}`}
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                    >
                      <View style={[styles.radio, active && styles.radioActive]}>
                        {active ? <View style={styles.radioDot} /> : null}
                      </View>
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Card>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          testID="submit-quiz-btn"
          title="Submit answers"
          onPress={submit}
          loading={submitting}
          disabled={questions.length === 0}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  qLabel: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.brandSecondary, letterSpacing: 1 },
  qText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.onSurface, lineHeight: 21 },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  optionActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  optionText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.onSurface },
  optionTextActive: { fontFamily: fonts.semiBold },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  scoreCard: { alignItems: "center", gap: 4, paddingVertical: spacing.xl },
  scoreText: { fontFamily: fonts.displayBold, fontSize: 34, color: colors.onSurface },
  scorePct: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceSecondary },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  correctAnswer: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.success },
  explanation: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 18 },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
});
