import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
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
  ScreenHeader,
  SectionTitle,
  Sheet,
} from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type Milestone = { id: string; title: string; description: string; status: string; target_date: string | null };
type Goal = { id: string; title: string; unit: string; target_value: number | null; current_value: number | null; status: string };
type ActionPlan = { id: string; title: string; items: { id: string; text: string; done: boolean }[] };
type Assignment = { id: string; title: string; instructions: string; status: string; submission: { text: string } | null; feedback: string | null };
type Note = { id: string; title: string; date: string; agenda: string; shared_note: string; private_note: string };
type Response = { id: string; template_title: string; reviewed: boolean; created_at: string; answer_list: { label: string; value: any }[] };

export default function ClientPlan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState("plan");
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState("Client");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [sheet, setSheet] = useState<null | "milestone" | "goal" | "plan" | "assignment" | "note" | "feedback">(null);
  const [f1, setF1] = useState("");
  const [f2, setF2] = useState("");
  const [f3, setF3] = useState("");
  const [target, setTarget] = useState<Assignment | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [client, m, g, p, a, n, r] = await Promise.all([
        api<{ name: string }>(`/coach/clients/${id}`).catch(() => ({ name: "Client" })),
        api<Milestone[]>(`/studio/clients/${id}/milestones`).catch(() => []),
        api<Goal[]>(`/studio/clients/${id}/goals`).catch(() => []),
        api<ActionPlan[]>(`/studio/clients/${id}/action-plans`).catch(() => []),
        api<Assignment[]>(`/studio/clients/${id}/assignments`).catch(() => []),
        api<Note[]>(`/studio/clients/${id}/notes`).catch(() => []),
        api<Response[]>(`/studio/checkin-responses?client_id=${id}`).catch(() => []),
      ]);
      setClientName(client.name ?? "Client");
      setMilestones(m);
      setGoals(g);
      setPlans(p);
      setAssignments(a);
      setNotes(n);
      setResponses(r);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const closeSheet = () => {
    setSheet(null);
    setF1("");
    setF2("");
    setF3("");
    setTarget(null);
  };

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      if (sheet === "milestone" && f1.trim()) {
        await api(`/studio/clients/${id}/milestones`, {
          method: "POST",
          body: { title: f1.trim(), description: f2.trim(), order: milestones.length },
        });
      } else if (sheet === "goal" && f1.trim()) {
        await api(`/studio/clients/${id}/goals`, {
          method: "POST",
          body: {
            title: f1.trim(),
            unit: f3.trim(),
            target_value: parseFloat(f2) || null,
            current_value: null,
          },
        });
      } else if (sheet === "plan" && f1.trim()) {
        const items = f2
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean)
          .map((text) => ({ text }));
        await api(`/studio/clients/${id}/action-plans`, {
          method: "POST",
          body: { title: f1.trim(), items },
        });
      } else if (sheet === "assignment" && f1.trim()) {
        await api(`/studio/clients/${id}/assignments`, {
          method: "POST",
          body: { title: f1.trim(), instructions: f2.trim() },
        });
      } else if (sheet === "note" && f1.trim()) {
        await api(`/studio/clients/${id}/notes`, {
          method: "POST",
          body: { title: f1.trim(), agenda: "", shared_note: f2.trim(), private_note: f3.trim() },
        });
      } else if (sheet === "feedback" && target && f1.trim()) {
        await api(`/studio/assignments/${target.id}/review`, { method: "POST", body: { feedback: f1.trim() } });
      }
      closeSheet();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const achieve = async (m: Milestone) => {
    await api(`/studio/milestones/${m.id}/achieve`, { method: "POST" });
    load();
  };

  const reviewResponse = async (r: Response) => {
    await api(`/studio/checkin-responses/${r.id}/review`, { method: "POST" });
    load();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Client plan" />
        <Loading />
      </View>
    );
  }

  const addFor: Record<string, "milestone" | "assignment" | "note"> = {
    plan: "milestone",
    work: "assignment",
    notes: "note",
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={clientName}
        subtitle="Private coaching plan"
        right={
          tab !== "checkins" ? (
            <TouchableOpacity
              testID="plan-add-btn"
              style={styles.iconBtn}
              onPress={() => setSheet(addFor[tab])}
            >
              <Ionicons name="add" size={26} color={colors.brand} />
            </TouchableOpacity>
          ) : null
        }
      />
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Segmented
          testIDPrefix="plan-tab"
          value={tab}
          onChange={setTab}
          options={[
            { key: "plan", label: "Plan" },
            { key: "work", label: "Work" },
            { key: "notes", label: "Notes" },
            { key: "checkins", label: "Check-ins" },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {tab === "plan" ? (
          <>
            <SectionTitle
              right={
                <TouchableOpacity testID="add-goal-btn" onPress={() => setSheet("goal")}>
                  <Text style={styles.action}>+ Goal</Text>
                </TouchableOpacity>
              }
            >
              MILESTONES
            </SectionTitle>
            {milestones.length === 0 ? (
              <Text style={styles.hint}>No milestones yet.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {milestones.map((m) => (
                  <Card key={m.id} testID={`milestone-${m.id}`} style={{ gap: 4 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.title}>{m.title}</Text>
                      <TouchableOpacity testID={`achieve-${m.id}`} onPress={() => achieve(m)}>
                        <Pill
                          label={m.status === "achieved" ? "ACHIEVED" : "MARK DONE"}
                          tone={m.status === "achieved" ? "good" : "neutral"}
                        />
                      </TouchableOpacity>
                    </View>
                    {m.description ? <Text style={styles.hint}>{m.description}</Text> : null}
                  </Card>
                ))}
              </View>
            )}

            <SectionTitle
              right={
                <TouchableOpacity testID="add-plan-btn" onPress={() => setSheet("plan")}>
                  <Text style={styles.action}>+ Action plan</Text>
                </TouchableOpacity>
              }
            >
              GOALS
            </SectionTitle>
            {goals.length === 0 ? (
              <Text style={styles.hint}>No goals yet.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {goals.map((g) => {
                  const pct =
                    g.target_value && g.current_value
                      ? Math.min(100, Math.round((g.current_value / g.target_value) * 100))
                      : 0;
                  return (
                    <Card key={g.id} testID={`goal-${g.id}`} style={{ gap: 6 }}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.title}>{g.title}</Text>
                        <Text style={styles.metaGold}>
                          {g.current_value ?? "–"}/{g.target_value ?? "–"} {g.unit}
                        </Text>
                      </View>
                      <ProgressBar pct={pct} />
                    </Card>
                  );
                })}
              </View>
            )}

            <SectionTitle>ACTION PLANS</SectionTitle>
            {plans.length === 0 ? (
              <Text style={styles.hint}>No action plans yet.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {plans.map((p) => (
                  <Card key={p.id} testID={`actionplan-${p.id}`} style={{ gap: 6 }}>
                    <Text style={styles.title}>{p.title}</Text>
                    {p.items.map((it) => (
                      <Text key={it.id} style={styles.hint}>
                        {it.done ? "✓" : "○"} {it.text}
                      </Text>
                    ))}
                  </Card>
                ))}
              </View>
            )}
          </>
        ) : null}

        {tab === "work" ? (
          assignments.length === 0 ? (
            <EmptyState icon="document-outline" title="No assignments" body="Assign homework, worksheets or reflections." />
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {assignments.map((a) => (
                <Card key={a.id} testID={`assignment-${a.id}`} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>{a.title}</Text>
                    <Pill
                      label={a.status.toUpperCase()}
                      tone={a.status === "reviewed" ? "good" : a.status === "submitted" ? "warn" : "neutral"}
                    />
                  </View>
                  {a.instructions ? <Text style={styles.hint}>{a.instructions}</Text> : null}
                  {a.submission ? (
                    <Text style={styles.submission}>“{a.submission.text}”</Text>
                  ) : null}
                  {a.feedback ? <Text style={styles.metaGold}>Your feedback: {a.feedback}</Text> : null}
                  {a.status === "submitted" ? (
                    <TouchableOpacity
                      testID={`feedback-${a.id}`}
                      onPress={() => {
                        setTarget(a);
                        setSheet("feedback");
                      }}
                    >
                      <Text style={styles.action}>Give feedback</Text>
                    </TouchableOpacity>
                  ) : null}
                </Card>
              ))}
            </View>
          )
        ) : null}

        {tab === "notes" ? (
          notes.length === 0 ? (
            <EmptyState icon="create-outline" title="No session notes" body="Keep private notes plus a shared summary your client can read." />
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {notes.map((n) => (
                <Card key={n.id} testID={`note-${n.id}`} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>{n.title}</Text>
                    <Text style={styles.hint}>{new Date(n.date).toLocaleDateString()}</Text>
                  </View>
                  {n.shared_note ? (
                    <View style={styles.sharedBox}>
                      <Text style={styles.sharedLabel}>SHARED WITH CLIENT</Text>
                      <Text style={styles.hint}>{n.shared_note}</Text>
                    </View>
                  ) : null}
                  {n.private_note ? (
                    <View style={styles.privateBox}>
                      <Text style={styles.privateLabel}>PRIVATE — COACH ONLY</Text>
                      <Text style={styles.hint}>{n.private_note}</Text>
                    </View>
                  ) : null}
                </Card>
              ))}
            </View>
          )
        ) : null}

        {tab === "checkins" ? (
          responses.length === 0 ? (
            <EmptyState icon="clipboard-outline" title="No form check-ins" body="Create a check-in template in the Studio and assign it to clients." />
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {responses.map((r) => (
                <Card key={r.id} testID={`response-${r.id}`} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>{r.template_title}</Text>
                    <Pill label={r.reviewed ? "REVIEWED" : "NEW"} tone={r.reviewed ? "good" : "gold"} />
                  </View>
                  <Text style={styles.hint}>{new Date(r.created_at).toLocaleDateString()}</Text>
                  {r.answer_list?.map((a, i) => (
                    <Text key={i} style={styles.hint}>
                      • {a.label}: {String(a.value)}
                    </Text>
                  ))}
                  {!r.reviewed ? (
                    <TouchableOpacity testID={`review-${r.id}`} onPress={() => reviewResponse(r)}>
                      <Text style={styles.action}>Mark reviewed</Text>
                    </TouchableOpacity>
                  ) : null}
                </Card>
              ))}
            </View>
          )
        ) : null}
      </ScrollView>

      <Sheet
        visible={!!sheet}
        onClose={closeSheet}
        title={
          sheet === "milestone"
            ? "New milestone"
            : sheet === "goal"
              ? "New goal"
              : sheet === "plan"
                ? "New action plan"
                : sheet === "assignment"
                  ? "New assignment"
                  : sheet === "note"
                    ? "New session note"
                    : "Feedback"
        }
      >
        {sheet === "feedback" ? (
          <Field label="FEEDBACK" value={f1} onChangeText={setF1} placeholder="What they did well + next step" multiline testID="feedback-input" />
        ) : (
          <>
            <Field
              label="TITLE"
              value={f1}
              onChangeText={setF1}
              placeholder={sheet === "goal" ? "Bodyweight" : "Title"}
              testID="plan-f1-input"
            />
            <Field
              label={
                sheet === "goal"
                  ? "TARGET VALUE"
                  : sheet === "plan"
                    ? "ITEMS (ONE PER LINE)"
                    : sheet === "note"
                      ? "SHARED WITH CLIENT"
                      : "DETAILS"
              }
              value={f2}
              onChangeText={setF2}
              keyboardType={sheet === "goal" ? "numeric" : "default"}
              multiline={sheet !== "goal"}
              testID="plan-f2-input"
            />
            {sheet === "goal" ? (
              <Field label="UNIT" value={f3} onChangeText={setF3} placeholder="lb / kg / reps" testID="plan-f3-input" />
            ) : null}
            {sheet === "note" ? (
              <Field label="PRIVATE NOTE (NEVER SHOWN TO CLIENT)" value={f3} onChangeText={setF3} multiline testID="plan-f3-input" />
            ) : null}
          </>
        )}
        <Button testID="plan-save-btn" title="Save" onPress={save} loading={saving} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 19 },
  metaGold: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.brand },
  action: { fontFamily: fonts.bold, fontSize: 12, color: colors.brand },
  submission: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.onSurfaceTertiary,
    fontStyle: "italic",
    lineHeight: 19,
  },
  sharedBox: { backgroundColor: colors.brandTertiary, borderRadius: 10, padding: spacing.md, gap: 3 },
  sharedLabel: { fontFamily: fonts.bold, fontSize: 9.5, color: colors.onBrandTertiary, letterSpacing: 0.8 },
  privateBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    gap: 3,
  },
  privateLabel: { fontFamily: fonts.bold, fontSize: 9.5, color: colors.warning, letterSpacing: 0.8 },
});
