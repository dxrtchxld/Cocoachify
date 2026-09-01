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
import { colors, fonts, spacing } from "@/src/theme";

type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  lifecycle: string;
  tags: string[];
  answers: Record<string, string>;
  created_at: string;
};
type LeadForm = { id: string; title: string; intro: string; submissions: number; fields: { key: string; label: string }[] };
type Segment = { id: string; name: string; lifecycle: string[]; size: number };

const STAGES = ["lead", "applied", "active", "paused", "churned"];
const TONE: Record<string, "neutral" | "gold" | "good" | "warn" | "bad"> = {
  lead: "gold",
  applied: "neutral",
  active: "good",
  paused: "warn",
  churned: "bad",
};

export default function ContactsScreen() {
  const [tab, setTab] = useState("contacts");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [history, setHistory] = useState<{ kind: string; title: string; status: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [segOpen, setSegOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formIntro, setFormIntro] = useState("");
  const [formQuestion, setFormQuestion] = useState("");
  const [segName, setSegName] = useState("");
  const [segStages, setSegStages] = useState<string[]>(["lead"]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, f, s] = await Promise.all([
        api<Contact[]>("/studio/contacts"),
        api<LeadForm[]>("/studio/lead-forms").catch(() => []),
        api<Segment[]>("/studio/segments").catch(() => []),
      ]);
      setContacts(c);
      setForms(f);
      setSegments(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addContact = async () => {
    if (!email.trim()) return;
    setError("");
    try {
      await api("/studio/contacts", {
        method: "POST",
        body: { name: name.trim(), email: email.trim().toLowerCase(), lifecycle: "lead" },
      });
      setName("");
      setEmail("");
      setAddOpen(false);
      load();
    } catch (e: any) {
      setError(e?.message ?? "Could not add contact");
    }
  };

  const setStage = async (contact: Contact, lifecycle: string) => {
    setSelected(null);
    await api(`/studio/contacts/${contact.id}`, { method: "PUT", body: { lifecycle } });
    load();
  };

  const openContact = async (c: Contact) => {
    setSelected(c);
    try {
      const res = await api<{ history: { kind: string; title: string; status: string }[] }>(
        `/studio/contacts/${c.id}/history`,
      );
      setHistory(res.history);
    } catch {
      setHistory([]);
    }
  };

  const createForm = async () => {
    if (!formTitle.trim()) return;
    await api("/studio/lead-forms", {
      method: "POST",
      body: {
        title: formTitle.trim(),
        intro: formIntro.trim(),
        fields: formQuestion.trim() ? [{ label: formQuestion.trim(), type: "textarea", required: true }] : [],
      },
    });
    setFormTitle("");
    setFormIntro("");
    setFormQuestion("");
    setFormOpen(false);
    load();
  };

  const createSegment = async () => {
    if (!segName.trim()) return;
    await api("/studio/segments", {
      method: "POST",
      body: { name: segName.trim(), lifecycle: segStages },
    });
    setSegName("");
    setSegStages(["lead"]);
    setSegOpen(false);
    load();
  };

  const counts = STAGES.map((s) => ({ stage: s, n: contacts.filter((c) => c.lifecycle === s).length }));

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Contacts & Leads"
        subtitle={`${contacts.length} contacts`}
        right={
          <TouchableOpacity
            testID="crm-add-btn"
            style={styles.iconBtn}
            onPress={() => (tab === "contacts" ? setAddOpen(true) : tab === "forms" ? setFormOpen(true) : setSegOpen(true))}
          >
            <Ionicons name="add" size={26} color={colors.brand} />
          </TouchableOpacity>
        }
      />
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Segmented
          testIDPrefix="crm-tab"
          value={tab}
          onChange={setTab}
          options={[
            { key: "contacts", label: "Contacts" },
            { key: "forms", label: "Forms" },
            { key: "segments", label: "Segments" },
          ]}
        />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {tab === "contacts" ? (
            <>
              <Card style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {counts.map((c) => (
                  <View key={c.stage} style={styles.countChip}>
                    <Text style={styles.countValue}>{c.n}</Text>
                    <Text style={styles.countLabel}>{c.stage.toUpperCase()}</Text>
                  </View>
                ))}
              </Card>
              <SectionTitle>ALL CONTACTS</SectionTitle>
              {contacts.length === 0 ? (
                <EmptyState
                  testID="contacts-empty"
                  icon="people-outline"
                  title="No contacts yet"
                  body="Add someone manually, or publish a landing page with a lead form to capture applications."
                />
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {contacts.map((c) => (
                    <Row
                      key={c.id}
                      testID={`contact-${c.id}`}
                      icon="person-circle"
                      title={c.name}
                      subtitle={`${c.email}${c.source ? ` · ${c.source}` : ""}`}
                      onPress={() => openContact(c)}
                      right={<Pill label={c.lifecycle.toUpperCase()} tone={TONE[c.lifecycle] ?? "neutral"} />}
                    />
                  ))}
                </View>
              )}
            </>
          ) : null}

          {tab === "forms" ? (
            forms.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title="No lead forms"
                body="Create a form, attach it to a course landing page, and every submission lands here as a contact."
              />
            ) : (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {forms.map((f) => (
                  <Card key={f.id} testID={`form-${f.id}`} style={{ gap: 4 }}>
                    <Text style={styles.title}>{f.title}</Text>
                    {f.intro ? <Text style={styles.hint}>{f.intro}</Text> : null}
                    <Text style={styles.meta}>
                      {f.fields.length} question{f.fields.length === 1 ? "" : "s"} · {f.submissions} submissions
                    </Text>
                    <TouchableOpacity
                      testID={`delete-form-${f.id}`}
                      onPress={async () => {
                        await api(`/studio/lead-forms/${f.id}`, { method: "DELETE" });
                        load();
                      }}
                    >
                      <Text style={styles.remove}>Delete</Text>
                    </TouchableOpacity>
                  </Card>
                ))}
              </View>
            )
          ) : null}

          {tab === "segments" ? (
            segments.length === 0 ? (
              <EmptyState
                icon="filter-outline"
                title="No segments"
                body="Group contacts by lifecycle so you always know who to follow up with."
              />
            ) : (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {segments.map((s) => (
                  <Row
                    key={s.id}
                    testID={`segment-${s.id}`}
                    icon="filter"
                    title={s.name}
                    subtitle={s.lifecycle.join(", ") || "Everyone"}
                    right={<Pill label={`${s.size}`} tone="gold" />}
                  />
                ))}
              </View>
            )
          ) : null}
        </ScrollView>
      )}

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? "Contact"}>
        {selected ? (
          <>
            <Text style={styles.hint}>{selected.email}</Text>
            <SectionTitle>LIFECYCLE</SectionTitle>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {STAGES.map((st) => (
                <TouchableOpacity
                  key={st}
                  testID={`set-stage-${st}`}
                  onPress={() => setStage(selected, st)}
                  style={[styles.stageBtn, selected.lifecycle === st && styles.stageBtnActive]}
                >
                  <Text style={[styles.stageText, selected.lifecycle === st && { color: colors.onBrand }]}>
                    {st.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {Object.keys(selected.answers ?? {}).length > 0 ? (
              <>
                <SectionTitle>APPLICATION</SectionTitle>
                {Object.entries(selected.answers).map(([k, v]) => (
                  <Text key={k} style={styles.hint}>
                    • {v}
                  </Text>
                ))}
              </>
            ) : null}
            <SectionTitle>ENROLMENT HISTORY</SectionTitle>
            {history.length === 0 ? (
              <Text style={styles.hint}>No enrolments yet.</Text>
            ) : (
              history.map((h, i) => (
                <Text key={i} style={styles.hint}>
                  • {h.kind === "course" ? "Course" : "Program"}: {h.title} ({h.status})
                </Text>
              ))
            )}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add contact">
        <Field label="NAME" value={name} onChangeText={setName} placeholder="Sarah Miller" testID="contact-name-input" />
        <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="sarah@email.com" keyboardType="email-address" testID="contact-email-input" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button testID="save-contact-btn" title="Add contact" onPress={addContact} />
      </Sheet>

      <Sheet visible={formOpen} onClose={() => setFormOpen(false)} title="New lead form">
        <Field label="TITLE" value={formTitle} onChangeText={setFormTitle} placeholder="Coaching application" testID="form-title-input" />
        <Field label="INTRO" value={formIntro} onChangeText={setFormIntro} placeholder="Tell me a little about you" testID="form-intro-input" />
        <Field label="QUESTION" value={formQuestion} onChangeText={setFormQuestion} placeholder="What's your biggest challenge?" testID="form-question-input" />
        <Button testID="save-form-btn" title="Create form" onPress={createForm} />
      </Sheet>

      <Sheet visible={segOpen} onClose={() => setSegOpen(false)} title="New segment">
        <Field label="NAME" value={segName} onChangeText={setSegName} placeholder="Warm leads" testID="segment-name-input" />
        <Text style={styles.hint}>Include these lifecycle stages:</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {STAGES.map((st) => {
            const on = segStages.includes(st);
            return (
              <TouchableOpacity
                key={st}
                testID={`seg-stage-${st}`}
                onPress={() => setSegStages((prev) => (on ? prev.filter((x) => x !== st) : [...prev, st]))}
                style={[styles.stageBtn, on && styles.stageBtnActive]}
              >
                <Text style={[styles.stageText, on && { color: colors.onBrand }]}>{st.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Button testID="save-segment-btn" title="Create segment" onPress={createSegment} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  countChip: { minWidth: 62, gap: 1 },
  countValue: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.brand },
  countLabel: { fontFamily: fonts.medium, fontSize: 9.5, color: colors.onSurfaceSecondary, letterSpacing: 0.6 },
  title: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 19 },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.brandSecondary },
  remove: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.error, marginTop: 4 },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
  stageBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stageBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  stageText: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.onSurfaceSecondary, letterSpacing: 0.6 },
});
