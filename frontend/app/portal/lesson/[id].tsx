import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import LessonVideo from "@/src/components/player/LessonVideo";
import { Card, Loading, ScreenHeader, SectionTitle } from "@/src/components/studio/UI";
import { api, privateFileUrl } from "@/src/lib/api";
import { Lesson } from "@/src/lib/modules";
import { colors, fonts, spacing } from "@/src/theme";

const DIRECT_MEDIA = /\.(mp4|mov|m4v|webm|m3u8)$/i;

export default function PortalLesson() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoError, setVideoError] = useState("");

  const load = useCallback(async () => {
    try {
      setLesson(await api<Lesson>(`/studio/lessons/${id}`));
    } catch (e: any) {
      setError(e?.message ?? "Lesson unavailable");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve a playable source: uploaded private videos get a short-lived signed
  // URL; pasted links play inline only when they point at a real media file.
  useEffect(() => {
    if (!lesson) return;
    let alive = true;
    (async () => {
      if (lesson.video_file_id) {
        try {
          const url = await privateFileUrl(lesson.video_file_id);
          if (alive) setVideoUri(url);
        } catch (e: any) {
          if (alive) setVideoError(e?.message ?? "Video unavailable");
        }
        return;
      }
      if (lesson.video_url && DIRECT_MEDIA.test(lesson.video_url.split("?")[0])) {
        if (alive) setVideoUri(lesson.video_url);
      }
    })();
    return () => {
      alive = false;
    };
  }, [lesson]);

  const toggleComplete = async () => {
    if (!lesson) return;
    setBusy(true);
    try {
      await api(`/studio/lessons/${lesson.id}/${lesson.completed ? "uncomplete" : "complete"}`, {
        method: "POST",
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const openAttachment = async (fileId: string) => {
    try {
      await WebBrowser.openBrowserAsync(await privateFileUrl(fileId));
    } catch (e: any) {
      setError(e?.message ?? "Could not open file");
    }
  };

  const openVideo = async (url: string) => {
    await WebBrowser.openBrowserAsync(url);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Lesson" />
        <Loading />
      </View>
    );
  }

  if (!lesson) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Lesson" />
        <View style={{ padding: spacing.xl }}>
          <Text style={styles.error}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={lesson.title} subtitle={lesson.course_title} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}>
        {lesson.summary ? <Text style={styles.summary}>{lesson.summary}</Text> : null}

        {videoUri ? (
          <LessonVideo uri={videoUri} progressKey={lesson.id} chapters={lesson.chapters} />
        ) : lesson.video_file_id && !videoError ? (
          <View style={styles.video}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.videoText}>PREPARING VIDEO</Text>
          </View>
        ) : lesson.video_url ? (
          <TouchableOpacity testID="lesson-video-btn" style={styles.video} onPress={() => openVideo(lesson.video_url!)}>
            <Ionicons name="play-circle" size={44} color={colors.brand} />
            <Text style={styles.videoText}>Watch the video</Text>
          </TouchableOpacity>
        ) : null}

        {videoError ? <Text style={styles.error}>{videoError}</Text> : null}

        {lesson.content ? (
          <Card>
            <Text style={styles.body}>{lesson.content}</Text>
          </Card>
        ) : null}

        {(lesson.attachment_files ?? []).length > 0 ? (
          <>
            <SectionTitle>DOWNLOADS</SectionTitle>
            <View style={{ gap: spacing.sm }}>
              {lesson.attachment_files!.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  testID={`attachment-${f.id}`}
                  style={styles.attachment}
                  onPress={() => openAttachment(f.id)}
                >
                  <Ionicons name="document-attach" size={20} color={colors.brand} />
                  <Text style={styles.attachmentText}>{f.title}</Text>
                  <Ionicons name="download-outline" size={18} color={colors.onSurfaceSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        {(lesson.quiz_question_count ?? 0) > 0 ? (
          <Button
            testID="take-quiz-btn"
            title={`✨ Take quiz (${lesson.quiz_question_count} question${lesson.quiz_question_count === 1 ? "" : "s"})`}
            variant="secondary"
            onPress={() => router.push({ pathname: "/portal/quiz", params: { lessonId: lesson.id } })}
          />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          testID="complete-lesson-btn"
          title={lesson.completed ? "Completed — undo" : "Mark as complete"}
          variant={lesson.completed ? "secondary" : "primary"}
          loading={busy}
          onPress={toggleComplete}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  summary: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 21 },
  body: { fontFamily: fonts.regular, fontSize: 14.5, color: colors.onSurface, lineHeight: 23 },
  video: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: spacing.xxl,
  },
  videoText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.brand, letterSpacing: 0.5 },
  attachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
  },
  attachmentText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.onSurface },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.error },
});
