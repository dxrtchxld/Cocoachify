import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import Segmented from "@/src/components/Segmented";
import { Card, Field, Loading, Row, ScreenHeader, SectionTitle, Sheet } from "@/src/components/studio/UI";
import { api, uploadPrivateFile } from "@/src/lib/api";
import { Lesson, Section } from "@/src/lib/modules";
import { colors, fonts, spacing } from "@/src/theme";

type LibraryFile = { id: string; title: string; kind: string };

export default function LessonEditor() {
  const { courseId, lessonId } = useLocalSearchParams<{ courseId: string; lessonId?: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFileId, setVideoFileId] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const [duration, setDuration] = useState("");
  const [releaseType, setReleaseType] = useState<"immediate" | "day_offset" | "date">("immediate");
  const [dayOffset, setDayOffset] = useState("7");
  const [releaseDate, setReleaseDate] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const course = await api<{ sections: Section[] }>(`/studio/courses/${courseId}`);
      setSections(course.sections);
      if (lessonId) {
        const l = await api<Lesson>(`/studio/lessons/${lessonId}`);
        setTitle(l.title);
        setSummary(l.summary);
        setContent(l.content);
        setVideoUrl(l.video_url ?? "");
        setVideoFileId((l as any).video_file_id ?? null);
        setDuration(String(l.duration_minutes || ""));
        setSectionId(l.module_id);
        setAttachments(l.attachments ?? []);
        setReleaseType(l.release.type);
        setDayOffset(String(l.release.day_offset || 7));
        setReleaseDate(l.release.date ? l.release.date.slice(0, 10) : "");
      } else if (course.sections.length) {
        setSectionId(course.sections[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [courseId, lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  const openPicker = async () => {
    setPickOpen(true);
    try {
      setFiles(await api<LibraryFile[]>("/library/files"));
    } catch {
      setFiles([]);
    }
  };

  const pickVideo = async () => {
    setError("");
    const res = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setVideoUploading(true);
    try {
      const file = await uploadPrivateFile(
        { uri: asset.uri, name: asset.name ?? "lesson.mp4", mimeType: asset.mimeType },
        { title: asset.name, visibility: "course", courseId: String(courseId) },
      );
      setVideoFileId(file.id);
      setVideoName(file.title);
    } catch (e: any) {
      setError(e?.message ?? "Video upload failed");
    } finally {
      setVideoUploading(false);
    }
  };

  const save = async () => {
    if (!title.trim()) {
      setError("Give the lesson a title");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      title: title.trim(),
      summary: summary.trim(),
      content: content.trim(),
      video_url: videoUrl.trim() || null,
      video_file_id: videoFileId,
      duration_minutes: parseInt(duration, 10) || 0,
      module_id: sectionId,
      order: 0,
      attachments,
      release: {
        type: releaseType,
        day_offset: releaseType === "day_offset" ? parseInt(dayOffset, 10) || 0 : 0,
        date: releaseType === "date" && releaseDate ? new Date(releaseDate).toISOString() : null,
      },
    };
    try {
      if (lessonId) {
        await api(`/studio/lessons/${lessonId}`, { method: "PUT", body });
      } else {
        await api(`/studio/courses/${courseId}/lessons`, { method: "POST", body });
      }
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Could not save lesson");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert("Delete lesson?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api(`/studio/lessons/${lessonId}`, { method: "DELETE" });
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Lesson" />
        <Loading />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={lessonId ? "Edit lesson" : "New lesson"} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="TITLE" value={title} onChangeText={setTitle} placeholder="Lesson 1 — Set your baseline" testID="lesson-title-input" />
        <Field label="SUMMARY" value={summary} onChangeText={setSummary} placeholder="One line clients see in the list" testID="lesson-summary-input" />
        <Field label="LESSON CONTENT" value={content} onChangeText={setContent} placeholder="Write the lesson…" multiline testID="lesson-content-input" />
        <SectionTitle>LESSON VIDEO</SectionTitle>
        {videoFileId ? (
          <Card style={{ gap: 6 }}>
            <Text style={styles.hint}>Video attached{videoName ? `: ${videoName}` : ""}. Only enrolled clients can play it.</Text>
            <TouchableOpacity testID="remove-video-btn" onPress={() => { setVideoFileId(null); setVideoName(""); }}>
              <Text style={styles.remove}>Remove video</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <Button
            testID="upload-video-btn"
            title={videoUploading ? "Uploading video…" : "Upload a video (max 40 MB)"}
            variant="secondary"
            loading={videoUploading}
            onPress={pickVideo}
          />
        )}

        <Field label="OR PASTE A VIDEO LINK" value={videoUrl} onChangeText={setVideoUrl} placeholder="https://…" testID="lesson-video-input" />
        <Field label="LENGTH (MINUTES)" value={duration} onChangeText={setDuration} placeholder="12" keyboardType="numeric" testID="lesson-duration-input" />

        {sections.length > 0 ? (
          <>
            <SectionTitle>SECTION</SectionTitle>
            <View style={{ gap: spacing.sm }}>
              {sections.map((s) => (
                <TouchableOpacity
                  key={s.id ?? "none"}
                  testID={`pick-section-${s.id}`}
                  onPress={() => setSectionId(s.id)}
                  style={[styles.pickRow, sectionId === s.id && styles.pickRowActive]}
                >
                  <Text style={[styles.pickText, sectionId === s.id && { color: colors.brand }]}>{s.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        <SectionTitle>RELEASE</SectionTitle>
        <Segmented
          testIDPrefix="release"
          value={releaseType}
          onChange={(k) => setReleaseType(k as any)}
          options={[
            { key: "immediate", label: "Instant" },
            { key: "day_offset", label: "Drip" },
            { key: "date", label: "Date" },
          ]}
        />
        {releaseType === "day_offset" ? (
          <Field
            label="UNLOCKS THIS MANY DAYS AFTER ENROLMENT"
            value={dayOffset}
            onChangeText={setDayOffset}
            keyboardType="numeric"
            testID="release-offset-input"
          />
        ) : null}
        {releaseType === "date" ? (
          <Field
            label="UNLOCK DATE (YYYY-MM-DD)"
            value={releaseDate}
            onChangeText={setReleaseDate}
            placeholder="2026-08-01"
            testID="release-date-input"
          />
        ) : null}

        <SectionTitle
          right={
            <TouchableOpacity testID="attach-btn" onPress={openPicker}>
              <Text style={styles.action}>+ Attach</Text>
            </TouchableOpacity>
          }
        >
          ATTACHMENTS
        </SectionTitle>
        {attachments.length === 0 ? (
          <Card>
            <Text style={styles.hint}>
              Attach worksheets, PDFs or recordings from your private library. Clients can only download
              them while enrolled.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {attachments.map((a) => (
              <Row
                key={a}
                icon="document-attach"
                title={files.find((f) => f.id === a)?.title ?? a}
                right={
                  <TouchableOpacity onPress={() => setAttachments((prev) => prev.filter((x) => x !== a))}>
                    <Text style={styles.remove}>Remove</Text>
                  </TouchableOpacity>
                }
              />
            ))}
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button testID="save-lesson-btn" title={lessonId ? "Save lesson" : "Add lesson"} onPress={save} loading={saving} />
        {lessonId ? (
          <Button testID="delete-lesson-btn" title="Delete lesson" variant="ghost" onPress={remove} />
        ) : null}
      </ScrollView>

      <Sheet visible={pickOpen} onClose={() => setPickOpen(false)} title="Attach from library">
        {files.length === 0 ? (
          <Text style={styles.hint}>Nothing in your library yet — upload files in Studio → Private Library.</Text>
        ) : (
          files.map((f) => (
            <Row
              key={f.id}
              testID={`attach-file-${f.id}`}
              icon="document"
              title={f.title}
              subtitle={f.kind.toUpperCase()}
              onPress={() => {
                setAttachments((prev) => (prev.includes(f.id) ? prev : [...prev, f.id]));
                setPickOpen(false);
              }}
            />
          ))
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  pickRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  pickRowActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  pickText: { fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.onSurface },
  action: { fontFamily: fonts.bold, fontSize: 12, color: colors.brand },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 18 },
  remove: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.error },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
});
