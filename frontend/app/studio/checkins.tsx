import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import Segmented from "@/src/components/Segmented";
import { Card, EmptyState, Field, Loading, Row, ScreenHeader, SectionTitle, Sheet } from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type Template = {
  id: string;
  title: string;
  cadence: string;
  questions: { id: string; label: string; type: string }[];
  client_ids: string[];
};
type Client = { user_id: string; name: string };

export default function CheckinTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [questions, setQuestions] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([
        api<Template[]>("/studio/checkin-templates"),
        api<Client[]>("/coach/clients").catch(() => []),
      ]);
      setTemplates(t);
      setClients(c);
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
    if (!title.trim()) return;
    setSaving(true);
    try {
      const qs = questions
        .split("\n")
        .map((q) => q.trim())
        .filter(Boolean)
        .map((label) => ({ label, type: "text", required: true }));
      await api("/studio/checkin-templates", {
        method: "POST",
        body: { title: title.trim(), cadence, questions: qs, client_ids: picked },
      });
      setTitle("");
      setQuestions("");
      setPicked([]);
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Check-in Forms"
        subtitle="Ask the same questions on a rhythm"
        right={
          <TouchableOpacity testID="new-template-btn" style={styles.iconBtn} onPress={() => setOpen(true)}>
            <Ionicons name="add" size={26} color={colors.brand} />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {templates.length === 0 ? (
            <EmptyState
              testID="templates-empty"
              icon="clipboard-outline"
              title="No check-in forms"
              body="Create one with your favourite questions and assign it to clients."
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {templates.map((t) => (
                <Card key={t.id} testID={`template-${t.id}`} style={{ gap: 6 }}>
                  <Text style={styles.title}>{t.title}</Text>
                  <Text style={styles.meta}>
                    {t.cadence.toUpperCase()} · {t.questions.length} question
                    {t.questions.length === 1 ? "" : "s"} ·{" "}
                    {t.client_ids.length ? `${t.client_ids.length} assigned` : "everyone"}
                  </Text>
                  {t.questions.map((q) => (
                    <Text key={q.id} style={styles.hint}>
                      • {q.label}
                    </Text>
                  ))}
                  <TouchableOpacity
                    testID={`delete-template-${t.id}`}
                    onPress={async () => {
                      await api(`/studio/checkin-templates/${t.id}`, { method: "DELETE" });
                      load();
                    }}
                  >
                    <Text style={styles.remove}>Delete</Text>
                  </TouchableOpacity>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="New check-in form">
        <Field label="TITLE" value={title} onChangeText={setTitle} placeholder="Weekly check-in" testID="template-title-input" />
        <Segmented
          testIDPrefix="cadence"
          value={cadence}
          onChange={setCadence}
          options={[
            { key: "daily", label: "Daily" },
            { key: "weekly", label: "Weekly" },
            { key: "monthly", label: "Monthly" },
          ]}
        />
        <Field
          label="QUESTIONS (ONE PER LINE)"
          value={questions}
          onChangeText={setQuestions}
          placeholder={"How was your energy?\nAny pain or niggles?\nWins this week?"}
          multiline
          testID="template-questions-input"
        />
        <SectionTitle>ASSIGN TO (NONE = EVERYONE)</SectionTitle>
        {clients.map((c) => (
          <Row
            key={c.user_id}
            testID={`assign-${c.user_id}`}
            icon={picked.includes(c.user_id) ? "checkbox" : "square-outline"}
            title={c.name}
            onPress={() =>
              setPicked((prev) => (prev.includes(c.user_id) ? prev.filter((x) => x !== c.user_id) : [...prev, c.user_id]))
            }
          />
        ))}
        <Button testID="save-template-btn" title="Create form" onPress={create} loading={saving} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.brandSecondary },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 19 },
  remove: { fontFamily: fonts.bold, fontSize: 12, color: colors.error, marginTop: 4 },
});
