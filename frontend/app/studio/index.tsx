import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  Card,
  Loading,
  Pill,
  Row,
  ScreenHeader,
  SectionTitle,
  StatTile,
} from "@/src/components/studio/UI";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { ModuleKey, useModules } from "@/src/lib/modules";
import { colors, fonts, spacing } from "@/src/theme";

type Overview = {
  clients: number;
  active_clients_7d: number;
  active_pct: number;
  courses: number;
  published_courses: number;
  course_enrollments: number;
  avg_course_progress: number;
  lessons_completed_7d: number;
  leads: number;
  contacts: number;
  checkins_pending: number;
  assignments_awaiting_review: number;
  revenue_total: number;
  revenue_30d: number;
};

const TILES: {
  key: ModuleKey;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  href: string;
}[] = [
  { key: "courses", icon: "school", title: "Courses & Cohorts", sub: "Lessons, drip release, enrolments", href: "/studio/courses" },
  { key: "coaching", icon: "flag", title: "Coaching Plans", sub: "Milestones, goals, assignments, notes", href: "/studio/clients-plans" },
  { key: "community", icon: "chatbubbles", title: "Community", sub: "Feed, announcements, events", href: "/community" },
  { key: "crm", icon: "people-circle", title: "Contacts & Leads", sub: "Lead forms, lifecycle, segments", href: "/studio/contacts" },
  { key: "memberships", icon: "card", title: "Memberships", sub: "Recurring plans + grace rules", href: "/studio/memberships" },
  { key: "files", icon: "folder-open", title: "Private Library", sub: "Worksheets, recordings, PDFs", href: "/studio/library" },
  { key: "assistant", icon: "sparkles", title: "Coach Assistant", sub: "Consent-based drafts for review", href: "/studio/assistant" },
];

export default function StudioHub() {
  const { user } = useAuth();
  const { modules, loading: modulesLoading, reload } = useModules();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await api<Overview>("/studio/analytics/overview"));
    } catch {
      setOverview(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      reload();
    }, [load, reload]),
  );

  const enabledCount = modules.filter((m) => m.enabled).length;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Coach Workspace"
        subtitle={`${enabledCount}/${modules.length} modules on`}
        right={
          <TouchableOpacity
            testID="modules-link"
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            onPress={() => router.push("/studio/modules")}
          >
            <Ionicons name="options" size={22} color={colors.brand} />
          </TouchableOpacity>
        }
      />
      {modulesLoading && !overview ? (
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
                await Promise.all([load(), reload()]);
                setRefreshing(false);
              }}
            />
          }
        >
          <Card style={{ gap: 4 }}>
            <Text style={styles.hello}>{(user?.name || "Coach").toUpperCase()}</Text>
            <Text style={styles.helloSub}>
              Your workspace runs beside your existing programs — nothing you already use has changed.
            </Text>
          </Card>

          <SectionTitle>THIS WEEK</SectionTitle>
          <View style={styles.tileRow}>
            <StatTile testID="stat-clients" value={overview?.clients ?? "–"} label="CLIENTS" />
            <StatTile testID="stat-active" value={`${overview?.active_pct ?? 0}%`} label="ACTIVE 7D" />
            <StatTile testID="stat-lessons" value={overview?.lessons_completed_7d ?? 0} label="LESSONS DONE" />
          </View>
          <View style={[styles.tileRow, { marginTop: spacing.sm }]}>
            <StatTile testID="stat-enrolments" value={overview?.course_enrollments ?? 0} label="ENROLMENTS" />
            <StatTile testID="stat-progress" value={`${overview?.avg_course_progress ?? 0}%`} label="AVG PROGRESS" />
            <StatTile testID="stat-leads" value={overview?.leads ?? 0} label="OPEN LEADS" />
          </View>

          {overview && (overview.checkins_pending > 0 || overview.assignments_awaiting_review > 0) ? (
            <>
              <SectionTitle>NEEDS YOU</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                {overview.checkins_pending > 0 ? (
                  <Row
                    icon="clipboard"
                    title={`${overview.checkins_pending} check-in${overview.checkins_pending > 1 ? "s" : ""} to review`}
                    subtitle="Form check-ins waiting on your reply"
                    onPress={() => router.push("/studio/clients-plans")}
                  />
                ) : null}
                {overview.assignments_awaiting_review > 0 ? (
                  <Row
                    icon="document-text"
                    title={`${overview.assignments_awaiting_review} assignment${overview.assignments_awaiting_review > 1 ? "s" : ""} submitted`}
                    subtitle="Give feedback so clients keep momentum"
                    onPress={() => router.push("/studio/clients-plans")}
                  />
                ) : null}
              </View>
            </>
          ) : null}

          <SectionTitle>MODULES</SectionTitle>
          <View style={{ gap: spacing.sm }}>
            <Row
              testID="practice-link"
              icon="ribbon"
              title="Coaching Practice"
              subtitle="Choose the modalities you coach and get a resource kit for each"
              onPress={() => router.push("/studio/practice")}
            />
            <Row
              testID="booking-link-row"
              icon="calendar"
              title="Booking"
              subtitle="Share a scheduling link and approve the times that work"
              onPress={() => router.push("/studio/booking")}
            />
            <Row
              testID="challenges-link"
              icon="trophy"
              title="Challenges"
              subtitle="Group goals with a live leaderboard"
              onPress={() => router.push("/studio/challenges")}
            />
            <Row
              testID="broadcasts-link"
              icon="megaphone"
              title="Broadcasts"
              subtitle="One message to a segment or a picked list of clients"
              onPress={() => router.push("/studio/broadcasts")}
            />
            <Row
              testID="certificates-link"
              icon="medal"
              title="Certificates"
              subtitle="Issued automatically when a client finishes a course"
              onPress={() => router.push("/studio/certificates")}
            />
            {TILES.map((t) => {
              const mod = modules.find((m) => m.key === t.key);
              const on = !!mod?.enabled;
              return (
                <Row
                  key={t.key}
                  testID={`module-${t.key}`}
                  icon={t.icon}
                  title={t.title}
                  subtitle={t.sub}
                  onPress={() => router.push(on ? (t.href as any) : "/studio/modules")}
                  right={on ? undefined : <Pill label="OFF" tone="neutral" />}
                />
              );
            })}
          </View>

          <SectionTitle>REVENUE</SectionTitle>
          <Card style={{ flexDirection: "row", gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.money}>${(overview?.revenue_30d ?? 0).toFixed(0)}</Text>
              <Text style={styles.moneyLabel}>LAST 30 DAYS</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.money}>${(overview?.revenue_total ?? 0).toFixed(0)}</Text>
              <Text style={styles.moneyLabel}>ALL TIME</Text>
            </View>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hello: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.brand, letterSpacing: 1 },
  helloSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
  tileRow: { flexDirection: "row", gap: spacing.sm },
  money: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.onSurface },
  moneyLabel: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.onSurfaceSecondary, letterSpacing: 0.8 },
});
