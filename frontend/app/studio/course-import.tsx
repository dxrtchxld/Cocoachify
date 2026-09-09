/** "Bulk Upload & Auto-Organize" — coach uploads a batch of files (video, PDF,
 * docs, slides) and/or a course outline doc; AI proposes a Course > Module >
 * Lesson structure that the coach reviews/edits here before anything is
 * actually created. Nothing is saved until "Create Course" is tapped. */
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Button from "@/src/components/Button";
import { Card, EmptyState, Field, ScreenHeader, SectionTitle } from "@/src/components/studio/UI";
import { api, ApiError, ImportedFile, ImportPlan, uploadCourseImport } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

const PICK_TYPES = [
  "video/mp4",
  "video/quicktime",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
];

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  video: "videocam",
  audio: "musical-notes",
  pdf: "document-text",
  doc: "document",
  image: "image",
};

type PickedFile = { uri: string; name: string; mimeType?: string };

export default function CourseImportScreen() {
  const [step, setStep] = useState<"pick" | "analyzing" | "review">("pick");
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [courseTitleHint, setCourseTitleHint] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [importId, setImportId] = useState<string | null>(null);
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);

  const pickFiles = async () => {
    setError("");
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: PICK_TYPES,
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const next = res.assets.map((a) => ({ uri: a.uri, name: a.name ?? "file", mimeType: a.mimeType }));
      setPicked((prev) => {
        const merged = [...prev, ...next];
        return merged.slice(0, 10);
      });
    } catch {
      setError("Couldn't open the file picker. Try again.");
    }
  };

  const removePicked = (idx: number) => setPicked((prev) => prev.filter((_, i) => i !== idx));

  const analyze = async () => {
    if (picked.length === 0) return;
    setStep("analyzing");
    setError("");
    try {
      const res = await uploadCourseImport(picked, courseTitleHint.trim());
      setImportId(res.id);
      setImportedFiles(res.files);
      setPlan(res.plan);
      setStep("review");
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : "Couldn't analyze your files. Try again.");
      setStep("pick");
    }
  };

  const updateModuleTitle = (mIdx: number, title: string) => {
    if (!plan) return;
    const modules = plan.modules.map((m, i) => (i === mIdx ? { ...m, title } : m));
    setPlan({ ...plan, modules });
  };

  const updateLesson = (mIdx: number, lIdx: number, patch: Partial<{ title: string; summary: string }>) => {
    if (!plan) return;
    const modules = plan.modules.map((m, i) => {
      if (i !== mIdx) return m;
      const lessons = m.lessons.map((l, j) => (j === lIdx ? { ...l, ...patch } : l));
      return { ...m, lessons };
    });
    setPlan({ ...plan, modules });
  };

  const removeLesson = (mIdx: number, lIdx: number) => {
    if (!plan) return;
    const modules = plan.modules
      .map((m, i) => (i === mIdx ? { ...m, lessons: m.lessons.filter((_, j) => j !== lIdx) } : m))
      .filter((m) => m.lessons.length > 0);
    setPlan({ ...plan, modules });
  };

  const removeModule = (mIdx: number) => {
    if (!plan) return;
    setPlan({ ...plan, modules: plan.modules.filter((_, i) => i !== mIdx) });
  };

  const totalLessons = plan ? plan.modules.reduce((n, m) => n + m.lessons.length, 0) : 0;

  const confirm = async () => {
    if (!importId || !plan || totalLessons === 0) return;
    setSaving(true);
    setError("");
    try {
      const created = await api<{ id: string }>(`/studio/courses/import/${importId}/confirm`, {
        method: "POST",
        body: plan,
      });
      router.replace(`/studio/course/${created.id}`);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : "Couldn't create the course. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Auto-Organize"
        subtitle={step === "review" ? "Review the AI-suggested structure" : "Upload files, AI builds the course"}
      />

      {step === "pick" && (
        <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
          <Field
            label="COURSE TITLE (OPTIONAL)"
            value={courseTitleHint}
            onChangeText={setCourseTitleHint}
            placeholder="e.g. 8-Week Strength Foundations"
            testID="import-course-title-input"
          />

          <SectionTitle>{`${picked.length}/10 FILES SELECTED`}</SectionTitle>
          {picked.length === 0 ? (
            <EmptyState
              testID="import-empty"
              icon="cloud-upload-outline"
              title="Add your course files"
              body="Videos, PDFs, slides, docs, or an outline document. AI will read them and organize a course structure for you to review."
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {picked.map((f, idx) => (
                <Card key={`${f.uri}-${idx}`} style={styles.fileRow}>
                  <Ionicons name="document-attach-outline" size={18} color={colors.brand} />
                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <TouchableOpacity testID={`remove-picked-${idx}`} onPress={() => removePicked(idx)}>
                    <Ionicons name="close-circle" size={20} color={colors.onSurfaceSecondary} />
                  </TouchableOpacity>
                </Card>
              ))}
            </View>
          )}

          <Button
            testID="add-import-files-btn"
            title={picked.length === 0 ? "Add files" : "Add more files"}
            variant="secondary"
            onPress={pickFiles}
            style={{ marginTop: spacing.md }}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            testID="analyze-files-btn"
            title="Analyze & Organize"
            onPress={analyze}
            disabled={picked.length === 0}
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      )}

      {step === "analyzing" && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.analyzingTitle}>Analyzing your files…</Text>
          <Text style={styles.analyzingBody}>
            Reading documents and transcribing video/audio — this can take a minute for larger batches.
          </Text>
        </View>
      )}

      {step === "review" && plan && (
        <>
          <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
            {importedFiles.some((f) => f.error) && (
              <View style={styles.warnCard}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                <Text style={styles.warnText}>
                  {importedFiles.filter((f) => f.error).length} file(s) couldn&apos;t be used:{" "}
                  {importedFiles.filter((f) => f.error).map((f) => f.filename).join(", ")}
                </Text>
              </View>
            )}

            <Field
              label="COURSE TITLE"
              value={plan.course_title}
              onChangeText={(t) => setPlan({ ...plan, course_title: t })}
              testID="review-course-title"
            />
            <Field
              label="SUBTITLE"
              value={plan.course_subtitle}
              onChangeText={(t) => setPlan({ ...plan, course_subtitle: t })}
              testID="review-course-subtitle"
            />

            <SectionTitle>{`${plan.modules.length} MODULES · ${totalLessons} LESSONS`}</SectionTitle>
            <View style={{ gap: spacing.lg }}>
              {plan.modules.map((m, mIdx) => (
                <Card key={mIdx} style={{ gap: spacing.md }}>
                  <View style={styles.moduleHeader}>
                    <View style={{ flex: 1 }}>
                      <Field
                        value={m.title}
                        onChangeText={(t) => updateModuleTitle(mIdx, t)}
                        testID={`module-title-${mIdx}`}
                      />
                    </View>
                    <TouchableOpacity testID={`remove-module-${mIdx}`} onPress={() => removeModule(mIdx)}>
                      <Ionicons name="trash-outline" size={18} color={colors.onSurfaceSecondary} />
                    </TouchableOpacity>
                  </View>

                  {m.lessons.map((l, lIdx) => (
                    <View key={lIdx} style={styles.lessonCard}>
                      <View style={styles.lessonHeader}>
                        <Ionicons name={KIND_ICON[l.kind ?? "doc"] ?? "document"} size={15} color={colors.brandSecondary} />
                        <Text style={styles.lessonKind}>{(l.kind ?? "file").toUpperCase()}</Text>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity testID={`remove-lesson-${mIdx}-${lIdx}`} onPress={() => removeLesson(mIdx, lIdx)}>
                          <Ionicons name="close-circle-outline" size={18} color={colors.onSurfaceSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Field
                        value={l.title}
                        onChangeText={(t) => updateLesson(mIdx, lIdx, { title: t })}
                        testID={`lesson-title-${mIdx}-${lIdx}`}
                      />
                      <Field
                        value={l.summary}
                        onChangeText={(t) => updateLesson(mIdx, lIdx, { summary: t })}
                        multiline
                        placeholder="Lesson summary..."
                        testID={`lesson-summary-${mIdx}-${lIdx}`}
                      />
                    </View>
                  ))}
                </Card>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Button
              testID="create-course-from-import-btn"
              title={`Create Course (${totalLessons} lessons)`}
              onPress={confirm}
              loading={saving}
              disabled={totalLessons === 0}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scrollBody: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl },
  analyzingTitle: { fontFamily: fonts.displayBold, fontSize: 17, color: colors.onSurface, marginTop: spacing.sm },
  analyzingBody: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 19, maxWidth: 300 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  fileName: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5, color: colors.onSurface },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
  warnCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "rgba(255,214,10,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,214,10,0.3)",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warnText: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.warning, lineHeight: 17 },
  moduleHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lessonCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lessonHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  lessonKind: { fontFamily: fonts.bold, fontSize: 10, color: colors.brandSecondary, letterSpacing: 0.6 },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
