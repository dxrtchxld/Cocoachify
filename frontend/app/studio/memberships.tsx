import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import Segmented from "@/src/components/Segmented";
import {
  Card,
  EmptyState,
  Field,
  Loading,
  Pill,
  Row,
  ScreenHeader,
  SectionTitle,
  Sheet,
} from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { Course } from "@/src/lib/modules";
import { colors, fonts, spacing } from "@/src/theme";

type Plan = {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: "month" | "year";
  course_ids: string[];
  grace_days: number;
  active: boolean;
  active_members: number;
};

type Sub = {
  id: string;
  plan_name: string;
  member: { name: string };
  status: string;
  current_period_end: string | null;
  grace_until: string | null;
};

export default function MembershipsScreen() {
  const [tab, setTab] = useState("plans");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [grace, setGrace] = useState("7");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, s, c] = await Promise.all([
        api<Plan[]>("/studio/memberships/plans"),
        api<Sub[]>("/studio/memberships/subscriptions").catch(() => []),
        api<Course[]>("/studio/courses").catch(() => []),
      ]);
      setPlans(p);
      setSubs(s);
      setCourses(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const create = async () => {
    if (!name.trim()) return;
    setError("");
    try {
      await api("/studio/memberships/plans", {
        method: "POST",
        body: {
          name: name.trim(),
          price: parseFloat(price) || 0,
          interval,
          course_ids: picked,
          grace_days: parseInt(grace, 10) || 0,
        },
      });
      setName("");
      setPrice("");
      setPicked([]);
      setOpen(false);
      load();
    } catch (e: any) {
      setError(e?.message ?? "Could not create plan");
    }
  };

  const setStatus = async (sub: Sub, status: string) => {
    await api(`/studio/memberships/subscriptions/${sub.id}/status`, { method: "PUT", body: { status } });
    load();
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Memberships"
        subtitle="Recurring access with a clear grace period"
        right={
          <TouchableOpacity testID="new-plan-btn" style={styles.iconBtn} onPress={() => setOpen(true)}>
            <Ionicons name="add" size={26} color={colors.brand} />
          </TouchableOpacity>
        }
      />
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Segmented
          testIDPrefix="membership-tab"
          value={tab}
          onChange={setTab}
          options={[
            { key: "plans", label: "Plans" },
            { key: "members", label: "Members" },
          ]}
        />
      </View>
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {tab === "plans" ? (
            plans.length === 0 ? (
              <EmptyState
                testID="plans-empty"
                icon="card-outline"
                title="No membership plans"
                body="Create a plan to bundle courses into recurring access. Payment activates access; a missed payment pauses it after the grace period."
              />
            ) : (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {plans.map((p) => (
                  <Card key={p.id} testID={`plan-${p.id}`} style={{ gap: 6 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.title}>{p.name}</Text>
                      <Text style={styles.price}>
                        ${p.price}/{p.interval === "month" ? "mo" : "yr"}
                      </Text>
                    </View>
                    <Text style={styles.meta}>
                      {p.course_ids.length} course{p.course_ids.length === 1 ? "" : "s"} · {p.active_members} members ·{" "}
                      {p.grace_days}-day grace
                    </Text>
                    <TouchableOpacity
                      testID={`delete-plan-${p.id}`}
                      onPress={async () => {
                        try {
                          await api(`/studio/memberships/plans/${p.id}`, { method: "DELETE" });
                          load();
                        } catch (e: any) {
                          setError(e?.message ?? "Could not delete");
                        }
                      }}
                    >
                      <Text style={styles.remove}>Delete</Text>
                    </TouchableOpacity>
                  </Card>
                ))}
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </View>
            )
          ) : subs.length === 0 ? (
            <EmptyState icon="people-outline" title="No members yet" body="Members appear here once a plan is purchased." />
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {subs.map((s) => (
                <Card key={s.id} testID={`sub-${s.id}`} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>{s.member.name}</Text>
                    <Pill
                      label={s.status.toUpperCase()}
                      tone={s.status === "active" ? "good" : s.status === "past_due" ? "warn" : "bad"}
                    />
                  </View>
                  <Text style={styles.meta}>
                    {s.plan_name}
                    {s.current_period_end
                      ? ` · renews ${new Date(s.current_period_end).toLocaleDateString()}`
                      : ""}
                    {s.grace_until ? ` · grace ends ${new Date(s.grace_until).toLocaleDateString()}` : ""}
                  </Text>
                  <TouchableOpacity
                    testID={`toggle-sub-${s.id}`}
                    onPress={() => setStatus(s, s.status === "active" ? "paused" : "active")}
                  >
                    <Text style={styles.action}>{s.status === "active" ? "Pause access" : "Restore access"}</Text>
                  </TouchableOpacity>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="New membership plan">
        <Field label="NAME" value={name} onChangeText={setName} placeholder="Inner Circle" testID="plan-name-input" />
        <Field label="PRICE (USD)" value={price} onChangeText={setPrice} placeholder="99" keyboardType="numeric" testID="plan-price-input" />
        <Segmented
          testIDPrefix="plan-interval"
          value={interval}
          onChange={(k) => setInterval(k as any)}
          options={[
            { key: "month", label: "Monthly" },
            { key: "year", label: "Yearly" },
          ]}
        />
        <Field label="GRACE DAYS AFTER A MISSED PAYMENT" value={grace} onChangeText={setGrace} keyboardType="numeric" testID="plan-grace-input" />
        <SectionTitle>INCLUDED COURSES</SectionTitle>
        {courses.length === 0 ? (
          <Text style={styles.meta}>Create a course first to bundle it into a plan.</Text>
        ) : (
          courses.map((c) => (
            <Row
              key={c.id}
              testID={`plan-course-${c.id}`}
              icon={picked.includes(c.id) ? "checkbox" : "square-outline"}
              title={c.title}
              onPress={() =>
                setPicked((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
              }
            />
          ))
        )}
        <Button testID="save-plan-btn" title="Create plan" onPress={create} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.onSurface },
  price: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.brand },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, lineHeight: 18 },
  action: { fontFamily: fonts.bold, fontSize: 12, color: colors.brand, marginTop: 2 },
  remove: { fontFamily: fonts.bold, fontSize: 12, color: colors.error, marginTop: 2 },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
});
