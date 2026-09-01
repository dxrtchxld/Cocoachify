import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Card, Loading, Pill, ProgressBar, ScreenHeader, SectionTitle } from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { Course, Section } from "@/src/lib/modules";
import { colors, coverFor, fonts, spacing } from "@/src/theme";

type Detail = Course & {
  sections: Section[];
  enrollment?: { progress_pct: number; completed_count: number };
};

export default function PortalCourse() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setCourse(await api<Detail>(`/studio/courses/${id}`));
    } catch (e: any) {
      setError(e?.message ?? "Course unavailable");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Course" />
        <Loading />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Course" />
        <View style={{ padding: spacing.xl }}>
          <Text style={styles.error}>{error}</Text>
        </View>
      </View>
    );
  }

  const total = course.lesson_count ?? 0;
  const done = course.enrollment?.completed_count ?? 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title={course.title} subtitle={`${done}/${total} lessons complete`} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Image source={{ uri: coverFor(course.category, course.cover_image) }} style={styles.cover} />
          <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            {course.subtitle ? <Text style={styles.sub}>{course.subtitle}</Text> : null}
            <ProgressBar pct={course.enrollment?.progress_pct ?? 0} />
            <Text style={styles.meta}>{course.enrollment?.progress_pct ?? 0}% complete</Text>
          </View>
        </Card>

        {course.description ? (
          <>
            <SectionTitle>ABOUT</SectionTitle>
            <Card>
              <Text style={styles.body}>{course.description}</Text>
            </Card>
          </>
        ) : null}

        {course.sections.map((sec) => (
          <View key={sec.id ?? "none"}>
            <SectionTitle>{sec.title.toUpperCase()}</SectionTitle>
            <View style={{ gap: spacing.sm }}>
              {sec.lessons.map((l) => {
                const locked = l.unlocked === false;
                return (
                  <TouchableOpacity
                    key={l.id}
                    testID={`portal-lesson-${l.id}`}
                    activeOpacity={locked ? 1 : 0.85}
                    onPress={() => (locked ? null : router.push(`/portal/lesson/${l.id}`))}
                    style={[styles.lesson, locked && styles.lessonLocked]}
                  >
                    <Ionicons
                      name={locked ? "lock-closed" : l.completed ? "checkmark-circle" : "play-circle"}
                      size={22}
                      color={locked ? colors.onSurfaceSecondary : l.completed ? colors.success : colors.brand}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lessonTitle, locked && { color: colors.onSurfaceSecondary }]}>
                        {l.title}
                      </Text>
                      {l.summary ? (
                        <Text style={styles.meta} numberOfLines={1}>
                          {l.summary}
                        </Text>
                      ) : null}
                    </View>
                    {locked ? (
                      <Pill
                        label={
                          l.release.type === "day_offset"
                            ? `DAY ${l.release.day_offset}`
                            : l.release.date
                              ? new Date(l.release.date).toLocaleDateString()
                              : "SOON"
                        }
                        tone="neutral"
                      />
                    ) : l.duration_minutes ? (
                      <Text style={styles.meta}>{l.duration_minutes}m</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  cover: { width: "100%", height: 150, backgroundColor: colors.surfaceTertiary },
  sub: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.onSurfaceTertiary },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.onSurfaceSecondary },
  body: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurfaceSecondary, lineHeight: 21 },
  lesson: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    minHeight: 62,
  },
  lessonLocked: { opacity: 0.65 },
  lessonTitle: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  error: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.error },
});
