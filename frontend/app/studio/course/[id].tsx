import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import CoverPicker from "@/src/components/CoverPicker";
import Segmented from "@/src/components/Segmented";
import {
  Card,
  EmptyState,
  Field,
  Loading,
  Pill,
  ProgressBar,
  Row,
  ScreenHeader,
  SectionTitle,
  Sheet,
} from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { Course, Section } from "@/src/lib/modules";
import { colors, coverFor, fonts, spacing } from "@/src/theme";

type CourseDetail = Course & {
  sections: Section[];
  is_owner: boolean;
  enrolled_count?: number;
  cohorts?: { id: string; name: string; start_date: string }[];
};

type Enrollment = {
  id: string;
  client: { user_id: string; name: string };
  access: string;
  progress_pct: number;
  completed_count: number;
  started_at: string;
};

type Perf = {
  enrollments: number;
  avg_progress: number;
  completion_rate: number;
  per_lesson: { lesson_id: string; title: string; pct: number }[];
  drop_off: { title: string; pct: number } | null;
};

export default function CoachCourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [perf, setPerf] = useState<Perf | null>(null);
  const [clients, setClients] = useState<{ user_id: string; name: string }[]>([]);
  const [tab, setTab] = useState("curriculum");
  const [loading, setLoading] = useState(true);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [cohortOpen, setCohortOpen] = useState(false);
  const [cohortName, setCohortName] = useState("");
  const [cohortStart, setCohortStart] = useState("");
  const [coverOpen, setCoverOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const setCover = async (url: string) => {
    if (!course) return;
    await api(`/studio/courses/${course.id}`, {
      method: "PUT",
      body: {
        title: course.title,
        subtitle: course.subtitle,
        description: course.description,
        category: course.category,
        cover_image: url,
        pricing_type: course.pricing_type,
        price: course.price,
        status: course.status,
      },
    });
    load();
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, e, p] = await Promise.all([
        api<CourseDetail>(`/studio/courses/${id}`),
        api<Enrollment[]>(`/studio/courses/${id}/enrollments`).catch(() => []),
        api<Perf>(`/studio/analytics/courses/${id}`).catch(() => null),
      ]);
      setCourse(c);
      setEnrollments(e);
      setPerf(p);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const togglePublish = async () => {
    if (!course) return;
    setBusy(true);
    try {
      await api(`/studio/courses/${course.id}`, {
        method: "PUT",
        body: {
          title: course.title,
          subtitle: course.subtitle,
          description: course.description,
          category: course.category,
          cover_image: course.cover_image,
          pricing_type: course.pricing_type,
          price: course.price,
          status: course.status === "published" ? "draft" : "published",
        },
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const addSection = async () => {
    if (!sectionTitle.trim() || !id) return;
    await api(`/studio/courses/${id}/sections`, { method: "POST", body: { title: sectionTitle.trim(), order: 0 } });
    setSectionTitle("");
    setSectionOpen(false);
    load();
  };

  const openEnroll = async () => {
    setEnrollOpen(true);
    try {
      setClients(await api<{ user_id: string; name: string }[]>("/coach/clients"));
    } catch {
      setClients([]);
    }
  };

  const enroll = async (clientId: string) => {
    await api(`/studio/courses/${id}/enroll`, { method: "POST", body: { client_id: clientId } });
    setEnrollOpen(false);
    load();
  };

  const setAccess = async (enrollmentId: string, access: string) => {
    await api(`/studio/enrollments/${enrollmentId}/access`, { method: "PUT", body: { access } });
    load();
  };

  const addCohort = async () => {
    if (!cohortName.trim() || !id) return;
    const iso = cohortStart.trim() ? new Date(cohortStart.trim()).toISOString() : new Date().toISOString();
    await api(`/studio/courses/${id}/cohorts`, {
      method: "POST",
      body: { name: cohortName.trim(), start_date: iso },
    });
    setCohortName("");
    setCohortStart("");
    setCohortOpen(false);
    load();
  };

  const removeCourse = () => {
    Alert.alert("Delete course?", "Lessons and enrolments for this course will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api(`/studio/courses/${id}`, { method: "DELETE" });
          router.back();
        },
      },
    ]);
  };

  if (loading || !course) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Course" />
        <Loading />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={course.title}
        subtitle={`${course.lesson_count ?? 0} lessons · ${course.enrolled_count ?? 0} enrolled`}
        right={
          <TouchableOpacity testID="delete-course-btn" style={styles.iconBtn} onPress={removeCourse}>
            <Ionicons name="trash-outline" size={20} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Image source={{ uri: coverFor(course.category, course.cover_image) }} style={styles.cover} />
          <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            <View style={styles.rowBetween}>
              <Pill
                label={course.status === "published" ? "LIVE" : "DRAFT"}
                tone={course.status === "published" ? "good" : "neutral"}
              />
              <Text style={styles.price}>
                {course.pricing_type === "free" ? "Free" : `$${course.price}`}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                testID="publish-btn"
                title={course.status === "published" ? "Unpublish" : "Publish"}
                variant="secondary"
                loading={busy}
                onPress={togglePublish}
                style={{ flex: 1 }}
              />
              <Button
                testID="landing-btn"
                title="Landing page"
                onPress={() => router.push(`/studio/landing/${course.id}`)}
                style={{ flex: 1 }}
              />
            </View>
            <Button
              testID="change-cover-btn"
              title="Change cover photo"
              variant="ghost"
              onPress={() => setCoverOpen(true)}
            />
          </View>
        </Card>

        <View style={{ marginTop: spacing.lg }}>
          <Segmented
            testIDPrefix="course-tab"
            value={tab}
            onChange={setTab}
            options={[
              { key: "curriculum", label: "Curriculum" },
              { key: "people", label: "People" },
              { key: "insights", label: "Insights" },
            ]}
          />
        </View>

        {tab === "curriculum" ? (
          <>
            <SectionTitle
              right={
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <TouchableOpacity testID="add-section-btn" onPress={() => setSectionOpen(true)}>
                    <Text style={styles.action}>+ Section</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="add-lesson-btn"
                    onPress={() => router.push(`/studio/lesson-editor?courseId=${course.id}`)}
                  >
                    <Text style={styles.action}>+ Lesson</Text>
                  </TouchableOpacity>
                </View>
              }
            >
              CURRICULUM
            </SectionTitle>
            {course.sections.length === 0 ? (
              <EmptyState
                icon="list-outline"
                title="Empty curriculum"
                body="Add a section (e.g. Week 1), then add lessons with an optional drip release."
              />
            ) : (
              course.sections.map((sec) => (
                <View key={sec.id ?? "none"} style={{ marginBottom: spacing.md }}>
                  <Text style={styles.secTitle}>{sec.title.toUpperCase()}</Text>
                  <View style={{ gap: spacing.sm }}>
                    {sec.lessons.length === 0 ? (
                      <Text style={styles.emptyLine}>No lessons in this section yet.</Text>
                    ) : (
                      sec.lessons.map((l) => (
                        <Row
                          key={l.id}
                          testID={`lesson-${l.id}`}
                          icon="play-circle"
                          title={l.title}
                          subtitle={`${l.duration_minutes || 0} min${
                            l.release.type === "day_offset"
                              ? ` · unlocks day ${l.release.day_offset}`
                              : l.release.type === "date"
                                ? " · scheduled"
                                : ""
                          }`}
                          onPress={() =>
                            router.push(`/studio/lesson-editor?courseId=${course.id}&lessonId=${l.id}`)
                          }
                        />
                      ))
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        ) : null}

        {tab === "people" ? (
          <>
            <SectionTitle
              right={
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <TouchableOpacity testID="add-cohort-btn" onPress={() => setCohortOpen(true)}>
                    <Text style={styles.action}>+ Cohort</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="enroll-btn" onPress={openEnroll}>
                    <Text style={styles.action}>+ Enrol</Text>
                  </TouchableOpacity>
                </View>
              }
            >
              ENROLLED
            </SectionTitle>
            {(course.cohorts ?? []).length > 0 ? (
              <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                {course.cohorts!.map((c) => (
                  <Row
                    key={c.id}
                    icon="people"
                    title={c.name}
                    subtitle={`Starts ${new Date(c.start_date).toLocaleDateString()}`}
                  />
                ))}
              </View>
            ) : null}
            {enrollments.length === 0 ? (
              <EmptyState icon="person-add-outline" title="Nobody enrolled yet" body="Enrol a client to give them access." />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {enrollments.map((e) => (
                  <Card key={e.id} testID={`enrollment-${e.id}`} style={{ gap: spacing.sm }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.name}>{e.client.name}</Text>
                      <Pill
                        label={e.access.toUpperCase()}
                        tone={e.access === "active" ? "good" : e.access === "paused" ? "warn" : "bad"}
                      />
                    </View>
                    <ProgressBar pct={e.progress_pct} />
                    <View style={styles.rowBetween}>
                      <Text style={styles.meta}>
                        {e.progress_pct}% · {e.completed_count} lessons done
                      </Text>
                      <TouchableOpacity
                        testID={`toggle-access-${e.id}`}
                        onPress={() => setAccess(e.id, e.access === "active" ? "paused" : "active")}
                      >
                        <Text style={styles.action}>{e.access === "active" ? "Pause" : "Resume"}</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </>
        ) : null}

        {tab === "insights" ? (
          <>
            <SectionTitle>PERFORMANCE</SectionTitle>
            <Card style={{ gap: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.lg }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.big}>{perf?.avg_progress ?? 0}%</Text>
                  <Text style={styles.metaLabel}>AVG PROGRESS</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.big}>{perf?.completion_rate ?? 0}%</Text>
                  <Text style={styles.metaLabel}>COMPLETED</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.big}>{perf?.enrollments ?? 0}</Text>
                  <Text style={styles.metaLabel}>ENROLLED</Text>
                </View>
              </View>
              {perf?.drop_off ? (
                <Text style={styles.dropOff}>
                  Drop-off starts at “{perf.drop_off.title}” ({perf.drop_off.pct}% completed)
                </Text>
              ) : null}
            </Card>
            {(perf?.per_lesson ?? []).length > 0 ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {perf!.per_lesson.map((l) => (
                  <Card key={l.lesson_id} style={{ gap: 6 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.lessonLine} numberOfLines={1}>
                        {l.title}
                      </Text>
                      <Text style={styles.meta}>{l.pct}%</Text>
                    </View>
                    <ProgressBar pct={l.pct} />
                  </Card>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <CoverPicker visible={coverOpen} onClose={() => setCoverOpen(false)} onPick={setCover} />

      <Sheet visible={sectionOpen} onClose={() => setSectionOpen(false)} title="New section">        <Field label="TITLE" value={sectionTitle} onChangeText={setSectionTitle} placeholder="Week 1 — Foundations" testID="section-title-input" />
        <Button testID="save-section-btn" title="Add section" onPress={addSection} />
      </Sheet>

      <Sheet visible={cohortOpen} onClose={() => setCohortOpen(false)} title="New cohort">
        <Field label="NAME" value={cohortName} onChangeText={setCohortName} placeholder="Spring 2026" testID="cohort-name-input" />
        <Field label="START DATE (YYYY-MM-DD)" value={cohortStart} onChangeText={setCohortStart} placeholder="2026-07-01" testID="cohort-start-input" />
        <Button testID="save-cohort-btn" title="Create cohort" onPress={addCohort} />
      </Sheet>

      <Sheet visible={enrollOpen} onClose={() => setEnrollOpen(false)} title="Enrol a client">
        {clients.length === 0 ? (
          <Text style={styles.emptyLine}>No connected clients yet.</Text>
        ) : (
          clients.map((c) => (
            <Row
              key={c.user_id}
              testID={`enroll-client-${c.user_id}`}
              icon="person"
              title={c.name}
              onPress={() => enroll(c.user_id)}
            />
          ))
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", height: 140, backgroundColor: colors.surfaceTertiary },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  price: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.brand },
  action: { fontFamily: fonts.bold, fontSize: 12, color: colors.brand, letterSpacing: 0.4 },
  secTitle: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.brandSecondary, letterSpacing: 1, marginBottom: spacing.sm },
  emptyLine: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary },
  name: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.onSurfaceSecondary },
  metaLabel: { fontFamily: fonts.medium, fontSize: 10, color: colors.onSurfaceSecondary, letterSpacing: 0.7 },
  big: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.brand },
  dropOff: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.warning, lineHeight: 18 },
  lessonLine: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.onSurface },
});
