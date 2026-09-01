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
  ProgressBar,
  Row,
  ScreenHeader,
  SectionTitle,
  Sheet,
} from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type Milestone = { id: string; title: string; description: string; status: string };
type Goal = { id: string; title: string; unit: string; target_value: number | null; current_value: number | null; status: string };
type ActionPlan = { id: string; title: string; items: { id: string; text: string; done: boolean }[] };
type Assignment = {
  id: string;
  title: string;
  instructions: string;
  status: string;
  submission: { text: string } | null;
  feedback: string | null;
};
type Note = { id: string; title: string; date: string; agenda: string; shared_note: string };
type Template = { id: string; title: string; cadence: string; questions: { id: string; label: string }[] };

type Plan = {
  milestones: Milestone[];
  goals: Goal[];
  action_plans: ActionPlan[];
  assignments: Assignment[];
  notes: Note[];
  checkins: Template[];
};

export default function PortalPlan() {
  const [tab, setTab] = useState("plan");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [goalValue, setGoalValue] = useState("");
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setPlan(await api<Plan>("/studio/my/plan"));
    } catch (e: any) {
      setError(e?.message ?? "Plan unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const saveGoal = async () => {
    if (!goal) return;
    setBusy(true);
    try {
      await api(`/studio/goals/${goal.id}/progress`, {
        method: "POST",
        body: { current_value: parseFloat(goalValue) || 0 },
      });
      setGoal(null);
      setGoalValue("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleItem = async (planId: string, itemId: string) => {
    await api(`/studio/action-plans/${planId}/items/${itemId}/toggle`, { method: "POST" });
    load();
  };

  const submit = async () => {
    if (!assignment) return;
    setBusy(true);
    try {
      await api(`/studio/assignments/${assignment.id}/submit`, {
        method: "POST",
        body: { text: submission.trim(), file_ids: [] },
      });
      setAssignment(null);
      setSubmission("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const sendCheckin = async () => {
    if (!template) return;
    setBusy(true);
    try {
      await api(`/studio/checkin-templates/${template.id}/respond`, { method: "POST", body: { answers } });
      setTemplate(null);
      setAnswers({});
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="My Plan" />
        <Loading />
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="My Plan" />
        <View style={{ padding: spacing.xl }}>
          <Text style={styles.error}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="My Plan" subtitle="Goals, work and check-ins" />
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Segmented
          testIDPrefix="portal-tab"
          value={tab}
          onChange={setTab}
          options={[
            { key: "plan", label: "Plan" },
            { key: "work", label: "Work" },
            { key: "notes", label: "Notes" },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {tab === "plan" ? (
          <>
            <SectionTitle>MILESTONES</SectionTitle>
            {plan.milestones.length === 0 ? (
              <Text style={styles.hint}>No milestones yet.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {plan.milestones.map((m) => (
                  <Card key={m.id} testID={`my-milestone-${m.id}`} style={{ gap: 4 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.title}>{m.title}</Text>
                      <Pill
                        label={m.status === "achieved" ? "ACHIEVED" : "IN PROGRESS"}
                        tone={m.status === "achieved" ? "good" : "gold"}
                      />
                    </View>
                    {m.description ? <Text style={styles.hint}>{m.description}</Text> : null}
                  </Card>
                ))}
              </View>
            )}

            <SectionTitle>GOALS</SectionTitle>
            {plan.goals.length === 0 ? (
              <Text style={styles.hint}>No goals yet.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {plan.goals.map((g) => {
                  const pct =
                    g.target_value && g.current_value
                      ? Math.min(100, Math.round((g.current_value / g.target_value) * 100))
                      : 0;
                  return (
                    <Card key={g.id} testID={`my-goal-${g.id}`} style={{ gap: 6 }}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.title}>{g.title}</Text>
                        <Text style={styles.gold}>
                          {g.current_value ?? "–"}/{g.target_value ?? "–"} {g.unit}
                        </Text>
                      </View>
                      <ProgressBar pct={pct} />
                      <TouchableOpacity
                        testID={`update-goal-${g.id}`}
                        onPress={() => {
                          setGoal(g);
                          setGoalValue(String(g.current_value ?? ""));
                        }}
                      >
                        <Text style={styles.action}>Update my number</Text>
                      </TouchableOpacity>
                    </Card>
                  );
                })}
              </View>
            )}

            <SectionTitle>MY ACTIONS</SectionTitle>
            {plan.action_plans.length === 0 ? (
              <Text style={styles.hint}>Nothing assigned yet.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {plan.action_plans.map((p) => (
                  <Card key={p.id} testID={`my-plan-${p.id}`} style={{ gap: spacing.sm }}>
                    <Text style={styles.title}>{p.title}</Text>
                    {p.items.map((it) => (
                      <TouchableOpacity
                        key={it.id}
                        testID={`toggle-item-${it.id}`}
                        style={styles.itemRow}
                        onPress={() => toggleItem(p.id, it.id)}
                      >
                        <Text style={[styles.item, it.done && styles.itemDone]}>
                          {it.done ? "✓" : "○"} {it.text}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </Card>
                ))}
              </View>
            )}

            <SectionTitle>CHECK-IN FORMS</SectionTitle>
            {plan.checkins.length === 0 ? (
              <Text style={styles.hint}>No check-in forms right now.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {plan.checkins.map((t) => (
                  <Row
                    key={t.id}
                    testID={`my-checkin-${t.id}`}
                    icon="clipboard"
                    title={t.title}
                    subtitle={`${t.cadence} · ${t.questions.length} questions`}
                    onPress={() => {
                      setTemplate(t);
                      setAnswers({});
                    }}
                  />
                ))}
              </View>
            )}
          </>
        ) : null}

        {tab === "work" ? (
          plan.assignments.length === 0 ? (
            <EmptyState icon="document-outline" title="No assignments" body="Your coach hasn't set any work yet." />
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {plan.assignments.map((a) => (
                <Card key={a.id} testID={`my-assignment-${a.id}`} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>{a.title}</Text>
                    <Pill
                      label={a.status.toUpperCase()}
                      tone={a.status === "reviewed" ? "good" : a.status === "submitted" ? "warn" : "neutral"}
                    />
                  </View>
                  {a.instructions ? <Text style={styles.hint}>{a.instructions}</Text> : null}
                  {a.submission ? <Text style={styles.quote}>“{a.submission.text}”</Text> : null}
                  {a.feedback ? <Text style={styles.gold}>Coach: {a.feedback}</Text> : null}
                  {a.status === "assigned" ? (
                    <TouchableOpacity
                      testID={`submit-${a.id}`}
                      onPress={() => {
                        setAssignment(a);
                        setSubmission("");
                      }}
                    >
                      <Text style={styles.action}>Submit</Text>
                    </TouchableOpacity>
                  ) : null}
                </Card>
              ))}
            </View>
          )
        ) : null}

        {tab === "notes" ? (
          plan.notes.length === 0 ? (
            <EmptyState icon="create-outline" title="No shared notes" body="Notes your coach shares with you appear here." />
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {plan.notes.map((n) => (
                <Card key={n.id} testID={`my-note-${n.id}`} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>{n.title}</Text>
                    <Text style={styles.hint}>{new Date(n.date).toLocaleDateString()}</Text>
                  </View>
                  {n.agenda ? <Text style={styles.hint}>Agenda: {n.agenda}</Text> : null}
                  {n.shared_note ? <Text style={styles.body}>{n.shared_note}</Text> : null}
                </Card>
              ))}
            </View>
          )
        ) : null}
      </ScrollView>

      <Sheet visible={!!goal} onClose={() => setGoal(null)} title={goal?.title ?? "Goal"}>
        <Field label="CURRENT VALUE" value={goalValue} onChangeText={setGoalValue} keyboardType="numeric" testID="goal-value-input" />
        <Button testID="save-goal-progress-btn" title="Save" onPress={saveGoal} loading={busy} />
      </Sheet>

      <Sheet visible={!!assignment} onClose={() => setAssignment(null)} title={assignment?.title ?? "Assignment"}>
        <Field label="YOUR RESPONSE" value={submission} onChangeText={setSubmission} multiline testID="submission-input" />
        <Button testID="save-submission-btn" title="Submit to coach" onPress={submit} loading={busy} />
      </Sheet>

      <Sheet visible={!!template} onClose={() => setTemplate(null)} title={template?.title ?? "Check-in"}>
        {(template?.questions ?? []).map((q) => (
          <Field
            key={q.id}
            label={q.label.toUpperCase()}
            value={answers[q.id] ?? ""}
            onChangeText={(t) => setAnswers((prev) => ({ ...prev, [q.id]: t }))}
            multiline
            testID={`answer-${q.id}`}
          />
        ))}
        <Button testID="send-checkin-btn" title="Send check-in" onPress={sendCheckin} loading={busy} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 19 },
  body: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurfaceTertiary, lineHeight: 21 },
  gold: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.brand },
  action: { fontFamily: fonts.bold, fontSize: 12, color: colors.brand, marginTop: 2 },
  quote: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceTertiary, fontStyle: "italic" },
  itemRow: { paddingVertical: 4 },
  item: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.onSurface },
  itemDone: { color: colors.onSurfaceSecondary, textDecorationLine: "line-through" },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.error },
});
