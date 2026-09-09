/** Quiz builder for a lesson — manual question editor + AI-assisted drafting.
 * Nothing is saved until "Save quiz" is tapped; AI-drafted questions are just
 * appended to the working list for the coach to review/edit first. */
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import Segmented from "@/src/components/Segmented";
import { Card, Field, Loading, ScreenHeader, Sheet } from "@/src/components/studio/UI";
import { api, ApiError } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type QType = "multiple_choice" | "true_false" | "short_answer";
type Question = {
  id: string;
  type: QType;
  question: string;
  options: string[];
  correct_index: number | null;
  correct_text: string | null;
  explanation: string;
};

const TYPE_LABEL: Record<QType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
};

function blankQuestion(type: QType): Question {
  return {
    id: `draft_${Date.now()}`,
    type,
    question: "",
    options: type === "true_false" ? ["True", "False"] : type === "multiple_choice" ? ["", ""] : [],
    correct_index: type === "true_false" ? 0 : null,
    correct_text: "",
    explanation: "",
  };
}

export default function LessonQuizScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Question>(blankQuestion("multiple_choice"));

  const load = useCallback(async () => {
    try {
      const res = await api<{ questions: Question[] }>(`/studio/lessons/${lessonId}/quiz`);
      setQuestions(res.questions);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load quiz");
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = (type: QType) => {
    setDraft(blankQuestion(type));
    setEditIndex(null);
    setEditorOpen(true);
  };

  const openEdit = (idx: number) => {
    setDraft({ ...questions[idx] });
    setEditIndex(idx);
    setEditorOpen(true);
  };

  const commitDraft = () => {
    if (!draft.question.trim()) return;
    if (draft.type === "multiple_choice") {
      const opts = draft.options.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2 || draft.correct_index === null || draft.correct_index >= opts.length) return;
    }
    if (draft.type === "short_answer" && !draft.correct_text?.trim()) return;

    setQuestions((prev) => {
      const next = [...prev];
      const clean = { ...draft, options: draft.options.map((o) => o.trim()).filter(Boolean) };
      if (editIndex === null) next.push(clean);
      else next[editIndex] = clean;
      return next;
    });
    setEditorOpen(false);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await api<{ questions: Question[] }>(`/studio/lessons/${lessonId}/quiz/generate`, {
        method: "POST",
        body: { count: 5, types: ["multiple_choice", "true_false"] },
      });
      setQuestions((prev) => [...prev, ...res.questions]);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : "AI couldn't draft a quiz for this lesson");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api(`/studio/lessons/${lessonId}/quiz`, { method: "PUT", body: { questions } });
      setSaved(true);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : "Couldn't save quiz");
    } finally {
      setSaving(false);
    }
  };

  const clearQuiz = () => {
    Alert.alert("Remove quiz?", "This deletes all questions for this lesson.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await api(`/studio/lessons/${lessonId}/quiz`, { method: "DELETE" });
          setQuestions([]);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Lesson quiz" />
        <Loading />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Lesson quiz" subtitle={`${questions.length} question${questions.length === 1 ? "" : "s"}`} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Button
          testID="generate-quiz-btn"
          title={generating ? "Generating…" : "✨ Generate questions with AI"}
          variant="secondary"
          loading={generating}
          onPress={generate}
        />

        {questions.length === 0 ? (
          <Card>
            <Text style={styles.hint}>
              No questions yet. Generate a draft with AI from this lesson&apos;s content, or add questions manually
              below.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {questions.map((q, idx) => (
              <Card key={q.id} style={{ gap: spacing.sm }}>
                <View style={styles.qHeader}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{TYPE_LABEL[q.type]}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity testID={`edit-question-${idx}`} onPress={() => openEdit(idx)}>
                    <Ionicons name="create-outline" size={18} color={colors.onSurfaceSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity testID={`delete-question-${idx}`} onPress={() => removeQuestion(idx)}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.qText}>{q.question}</Text>
                {q.type === "short_answer" ? (
                  <Text style={styles.answer}>Answer: {q.correct_text}</Text>
                ) : (
                  <Text style={styles.answer}>
                    Answer: {q.options[q.correct_index ?? -1] ?? "—"}
                  </Text>
                )}
              </Card>
            ))}
          </View>
        )}

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button testID="add-mc-btn" title="+ Multiple choice" variant="secondary" onPress={() => openNew("multiple_choice")} style={{ flex: 1 }} />
          <Button testID="add-tf-btn" title="+ True/False" variant="secondary" onPress={() => openNew("true_false")} style={{ flex: 1 }} />
        </View>
        <Button testID="add-sa-btn" title="+ Short answer" variant="secondary" onPress={() => openNew("short_answer")} />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.success}>Quiz saved.</Text> : null}
        <Button testID="save-quiz-btn" title="Save quiz" onPress={save} loading={saving} />
        {questions.length > 0 ? (
          <Button testID="clear-quiz-btn" title="Remove quiz" variant="ghost" onPress={clearQuiz} />
        ) : null}
      </ScrollView>

      <Sheet visible={editorOpen} onClose={() => setEditorOpen(false)} title={TYPE_LABEL[draft.type]}>
        <Field
          label="QUESTION"
          value={draft.question}
          onChangeText={(t) => setDraft((d) => ({ ...d, question: t }))}
          placeholder="What should you do before lifting heavy?"
          multiline
          testID="draft-question-input"
        />

        {draft.type === "multiple_choice" && (
          <View style={{ gap: spacing.sm }}>
            {draft.options.map((opt, i) => (
              <View key={i} style={styles.optionRow}>
                <TouchableOpacity
                  testID={`draft-correct-${i}`}
                  onPress={() => setDraft((d) => ({ ...d, correct_index: i }))}
                  style={[styles.radio, draft.correct_index === i && styles.radioActive]}
                >
                  {draft.correct_index === i ? <Ionicons name="checkmark" size={14} color={colors.onBrand} /> : null}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Field
                    value={opt}
                    onChangeText={(t) =>
                      setDraft((d) => ({ ...d, options: d.options.map((o, j) => (j === i ? t : o)) }))
                    }
                    placeholder={`Option ${i + 1}`}
                    testID={`draft-option-${i}`}
                  />
                </View>
                {draft.options.length > 2 ? (
                  <TouchableOpacity
                    testID={`remove-option-${i}`}
                    onPress={() =>
                      setDraft((d) => ({
                        ...d,
                        options: d.options.filter((_, j) => j !== i),
                        correct_index: d.correct_index === i ? null : d.correct_index,
                      }))
                    }
                  >
                    <Ionicons name="close-circle" size={18} color={colors.onSurfaceSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {draft.options.length < 6 ? (
              <TouchableOpacity
                testID="add-option-btn"
                onPress={() => setDraft((d) => ({ ...d, options: [...d.options, ""] }))}
              >
                <Text style={styles.addOption}>+ Add option</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {draft.type === "true_false" && (
          <Segmented
            testIDPrefix="draft-tf"
            value={draft.correct_index === 0 ? "true" : "false"}
            onChange={(k) => setDraft((d) => ({ ...d, correct_index: k === "true" ? 0 : 1 }))}
            options={[{ key: "true", label: "True" }, { key: "false", label: "False" }]}
          />
        )}

        {draft.type === "short_answer" && (
          <Field
            label="CORRECT ANSWER (EXACT MATCH, CASE-INSENSITIVE)"
            value={draft.correct_text ?? ""}
            onChangeText={(t) => setDraft((d) => ({ ...d, correct_text: t }))}
            placeholder="e.g. warm up"
            testID="draft-correct-text-input"
          />
        )}

        <Field
          label="EXPLANATION (OPTIONAL, SHOWN AFTER SUBMIT)"
          value={draft.explanation}
          onChangeText={(t) => setDraft((d) => ({ ...d, explanation: t }))}
          multiline
          testID="draft-explanation-input"
        />

        <Button testID="commit-question-btn" title={editIndex === null ? "Add question" : "Save question"} onPress={commitDraft} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 18 },
  qHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  typeBadge: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  typeBadgeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.onBrandTertiary, letterSpacing: 0.4 },
  qText: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface, lineHeight: 20 },
  answer: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.success },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
  success: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.success },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { backgroundColor: colors.success, borderColor: colors.success },
  addOption: { fontFamily: fonts.bold, fontSize: 13, color: colors.brand, paddingVertical: spacing.sm },
});
