import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  Card,
  EmptyState,
  Loading,
  Pill,
  ProgressBar,
  Row,
  ScreenHeader,
  SectionTitle,
} from "@/src/components/studio/UI";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { Course, useModules } from "@/src/lib/modules";
import { colors, coverFor, fonts, spacing } from "@/src/theme";

type Resume = {
  course_id: string;
  course_title: string;
  cover_image: string | null;
  category: string;
  lesson_id: string | null;
  lesson_title: string;
  duration_minutes: number;
  progress_pct: number;
  completed_count: number;
  lesson_count: number;
};

type Plan = {
  milestones: { id: string; title: string; status: string }[];
  goals: { id: string; title: string }[];
  assignments: { id: string; title: string; status: string }[];
  checkins: { id: string; title: string }[];
};

type Membership = { id: string; plan_name: string; status: string; current_period_end: string | null; grace_until: string | null };
type BookingLink = { available: boolean; slug: string | null };
type Booking = { id: string; session_type_name: string; starts_at: string; status: string };

export default function PortalHome() {
  const { user } = useAuth();
  const { enabled, loading: modulesLoading, reload } = useModules();
  const [resume, setResume] = useState<Resume | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [membership, setMembership] = useState<Membership[]>([]);
  const [bookingLink, setBookingLink] = useState<BookingLink>({ available: false, slug: null });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [r, c, p, m, bl, bk] = await Promise.all([
      api<{ resume: Resume | null }>("/studio/continue").catch(() => ({ resume: null })),
      api<Course[]>("/studio/courses").catch(() => []),
      api<Plan>("/studio/my/plan").catch(() => null),
      api<Membership[]>("/studio/memberships/my").catch(() => []),
      api<BookingLink>("/studio/booking/link").catch(() => ({ available: false, slug: null })),
      api<Booking[]>("/studio/booking/requests").catch(() => []),
    ]);
    setResume(r.resume);
    setCourses(c);
    setPlan(p);
    setMembership(m);
    setBookingLink(bl);
    setBookings(bk);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      reload();
    }, [load, reload]),
  );

  const openAssignments = (plan?.assignments ?? []).filter((a) => a.status !== "reviewed");
  const anything =
    resume || courses.length || (plan && (plan.milestones.length || plan.goals.length || plan.assignments.length));

  return (
    <View style={styles.container}>
      <ScreenHeader title="My Journey" subtitle={user?.name ?? undefined} />
      {loading || modulesLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.brand}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          {!anything ? (
            <EmptyState
              testID="portal-empty"
              icon="compass-outline"
              title="Nothing here yet"
              body="When your coach shares a course, milestone or check-in, it will appear here."
            />
          ) : null}

          {resume ? (
            <Card testID="resume-card" style={{ padding: 0, overflow: "hidden" }} onPress={() =>
              resume.lesson_id
                ? router.push(`/portal/lesson/${resume.lesson_id}`)
                : router.push(`/portal/course/${resume.course_id}`)
            }>
              <Image source={{ uri: coverFor(resume.category, resume.cover_image) }} style={styles.cover} />
              <View style={{ padding: spacing.lg, gap: spacing.sm }}>
                <Text style={styles.kicker}>PICK UP WHERE YOU LEFT OFF</Text>
                <Text style={styles.bigTitle}>{resume.lesson_title}</Text>
                <Text style={styles.meta}>
                  {resume.course_title}
                  {resume.duration_minutes ? ` · ${resume.duration_minutes} min` : ""}
                </Text>
                <ProgressBar pct={resume.progress_pct} />
                <Text style={styles.meta}>
                  {resume.completed_count}/{resume.lesson_count} lessons · {resume.progress_pct}%
                </Text>
              </View>
            </Card>
          ) : null}

          {courses.length > 0 ? (
            <>
              <SectionTitle>MY COURSES</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                {courses.map((c) => (
                  <Row
                    key={c.id}
                    testID={`portal-course-${c.id}`}
                    icon="school"
                    title={c.title}
                    subtitle={`${c.completed_count ?? 0}/${c.lesson_count ?? 0} lessons · ${c.progress_pct ?? 0}%`}
                    onPress={() => router.push(`/portal/course/${c.id}`)}
                    right={
                      c.access && c.access !== "active" ? (
                        <Pill label={c.access.toUpperCase()} tone="warn" />
                      ) : undefined
                    }
                  />
                ))}
              </View>
            </>
          ) : null}

          {plan ? (
            <>
              <SectionTitle>MY PLAN</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                <Row
                  testID="portal-plan-link"
                  icon="flag"
                  title="Goals, milestones & check-ins"
                  subtitle={`${plan.milestones.length} milestones · ${plan.goals.length} goals · ${plan.checkins.length} check-in forms`}
                  onPress={() => router.push("/portal/plan")}
                />
                {openAssignments.length > 0 ? (
                  <Row
                    testID="portal-assignments"
                    icon="document-text"
                    title={`${openAssignments.length} assignment${openAssignments.length > 1 ? "s" : ""} to do`}
                    subtitle="Tap to open and submit"
                    onPress={() => router.push("/portal/plan")}
                  />
                ) : null}
              </View>
            </>
          ) : null}

          {bookingLink.available || bookings.length > 0 ? (
            <>
              <SectionTitle>SESSIONS</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                {bookingLink.available && bookingLink.slug ? (
                  <Row
                    testID="portal-book-session"
                    icon="calendar"
                    title="Book a session"
                    subtitle="Pick a time from your coach's open slots"
                    onPress={() => router.push(`/book/${bookingLink.slug}`)}
                  />
                ) : null}
                {bookings
                  .filter((b) => b.status === "pending" || (b.status === "confirmed" && new Date(b.starts_at) >= new Date()))
                  .map((b) => (
                    <Row
                      key={b.id}
                      testID={`portal-booking-${b.id}`}
                      icon={b.status === "confirmed" ? "checkmark-circle" : "time"}
                      title={b.session_type_name}
                      subtitle={new Date(b.starts_at).toLocaleString()}
                      right={<Pill label={b.status.toUpperCase()} tone={b.status === "confirmed" ? "good" : "warn"} />}
                    />
                  ))}
              </View>
            </>
          ) : null}

          {enabled("community") ? (
            <>
              <SectionTitle>COMMUNITY</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                <Row
                  testID="portal-community"
                  icon="chatbubbles"
                  title="Community feed"
                  subtitle="Announcements, events and discussion"
                  onPress={() => router.push("/community")}
                />
                <Row
                  testID="portal-challenges"
                  icon="trophy"
                  title="Challenges"
                  subtitle="Join a group goal and see the leaderboard"
                  onPress={() => router.push("/studio/challenges")}
                />
              </View>
            </>
          ) : null}

          {courses.length > 0 ? (
            <>
              <SectionTitle>ACHIEVEMENTS</SectionTitle>
              <Row
                testID="portal-certificates"
                icon="medal"
                title="My certificates"
                subtitle="Earned when you finish every lesson in a course"
                onPress={() => router.push("/studio/certificates")}
              />
            </>
          ) : null}

          {enabled("files") ? (
            <>
              <SectionTitle>SHARED WITH ME</SectionTitle>
              <Row
                testID="portal-files"
                icon="folder-open"
                title="Files from my coach"
                subtitle="Worksheets, recordings and PDFs"
                onPress={() => router.push("/portal/files")}
              />
            </>
          ) : null}

          {membership.length > 0 ? (
            <>
              <SectionTitle>MEMBERSHIP</SectionTitle>
              {membership.map((m) => (
                <Card key={m.id} style={{ gap: 4 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>{m.plan_name}</Text>
                    <Pill
                      label={m.status.toUpperCase()}
                      tone={m.status === "active" ? "good" : m.status === "past_due" ? "warn" : "bad"}
                    />
                  </View>
                  {m.current_period_end ? (
                    <Text style={styles.meta}>
                      Renews {new Date(m.current_period_end).toLocaleDateString()}
                    </Text>
                  ) : null}
                  {m.grace_until ? (
                    <Text style={styles.warn}>
                      Payment needed — access stays on until {new Date(m.grace_until).toLocaleDateString()}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </>
          ) : null}

          {enabled("assistant") ? (
            <>
              <SectionTitle>PRIVACY</SectionTitle>
              <Row
                testID="portal-consent"
                icon="shield-checkmark"
                title="Assistant consent"
                subtitle="Choose whether your coach may use AI drafting on your data"
                onPress={() => router.push("/portal/consent")}
              />
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  cover: { width: "100%", height: 150, backgroundColor: colors.surfaceTertiary },
  kicker: { fontFamily: fonts.bold, fontSize: 10, color: colors.brand, letterSpacing: 1.4 },
  bigTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface },
  title: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.onSurfaceSecondary },
  warn: { fontFamily: fonts.medium, fontSize: 12, color: colors.warning, lineHeight: 18 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  iconRef: { color: colors.brand },
});
