import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
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

type Client = { user_id: string; name: string };
type Consent = { client_id: string; granted: boolean };
type Model = { id: string; label: string; default: boolean };
type Draft = {
  id: string;
  client_id: string;
  kind: string;
  model_label: string;
  content: string;
  status: string;
  created_at: string;
};

const KINDS: { key: string; label: string }[] = [
  { key: "agenda", label: "Session agenda" },
  { key: "checkin_summary", label: "Check-in summary" },
  { key: "followup", label: "Follow-up ideas" },
];

export default function AssistantScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<Client | null>(null);
  const [kind, setKind] = useState("agenda");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, co, m, d] = await Promise.all([
        api<Client[]>("/coach/clients"),
        api<Consent[]>("/studio/assistant/consent").catch(() => []),
        api<Model[]>("/studio/assistant/models").catch(() => []),
        api<Draft[]>("/studio/assistant/drafts").catch(() => []),
      ]);
      setClients(c);
      setConsents(co);
      setModels(m);
      setDrafts(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const hasConsent = (id: string) => consents.some((c) => c.client_id === id && c.granted);

  const generate = async () => {
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      await api("/studio/assistant/drafts", {
        method: "POST",
        body: { client_id: client.user_id, kind, model, coach_prompt: prompt.trim() },
      });
      setOpen(false);
      setPrompt("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not draft");
    } finally {
      setBusy(false);
    }
  };

  const consented = clients.filter((c) => hasConsent(c.user_id));

  return (
    <View style={styles.container}>
      <ScreenHeader title="Coach Assistant" subtitle="Drafts for your review — never sent to clients" />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          <Card>
            <Text style={styles.note}>
              The assistant only works for clients who have switched consent ON in their own app, and it
              never messages anyone. You review, edit and decide.
            </Text>
          </Card>

          <SectionTitle>CONSENT</SectionTitle>
          {clients.length === 0 ? (
            <Text style={styles.meta}>No connected clients yet.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {clients.map((c) => (
                <Row
                  key={c.user_id}
                  testID={`consent-${c.user_id}`}
                  icon="person"
                  title={c.name}
                  right={
                    <Pill
                      label={hasConsent(c.user_id) ? "CONSENTED" : "NOT GIVEN"}
                      tone={hasConsent(c.user_id) ? "good" : "neutral"}
                    />
                  }
                />
              ))}
            </View>
          )}

          <Button
            testID="new-draft-btn"
            title="Draft something"
            style={{ marginTop: spacing.lg }}
            onPress={() => {
              setClient(consented[0] ?? null);
              setModel(models.find((m) => m.default)?.id ?? "claude-sonnet-4-6");
              setOpen(true);
            }}
          />

          <SectionTitle>DRAFTS</SectionTitle>
          {drafts.length === 0 ? (
            <EmptyState
              testID="drafts-empty"
              icon="sparkles-outline"
              title="No drafts yet"
              body="Generate a session agenda, check-in summary or follow-up list for a consenting client."
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {drafts.map((d) => (
                <Card key={d.id} testID={`draft-${d.id}`} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>
                      {KINDS.find((k) => k.key === d.kind)?.label ?? d.kind}
                    </Text>
                    <Pill label={d.model_label} tone="gold" />
                  </View>
                  <Text style={styles.meta}>
                    {clients.find((c) => c.user_id === d.client_id)?.name ?? "Client"} ·{" "}
                    {new Date(d.created_at).toLocaleDateString()}
                  </Text>
                  <Text style={styles.body}>{d.content}</Text>
                  <TouchableOpacity
                    testID={`delete-draft-${d.id}`}
                    onPress={async () => {
                      await api(`/studio/assistant/drafts/${d.id}`, { method: "DELETE" });
                      load();
                    }}
                  >
                    <Text style={styles.remove}>Delete draft</Text>
                  </TouchableOpacity>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="New draft">
        <SectionTitle>CLIENT (CONSENTED ONLY)</SectionTitle>
        {consented.length === 0 ? (
          <Text style={styles.meta}>No client has given consent yet.</Text>
        ) : (
          consented.map((c) => (
            <TouchableOpacity
              key={c.user_id}
              testID={`pick-client-${c.user_id}`}
              style={[styles.pick, client?.user_id === c.user_id && styles.pickActive]}
              onPress={() => setClient(c)}
            >
              <Text style={[styles.pickText, client?.user_id === c.user_id && { color: colors.brand }]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))
        )}
        <SectionTitle>WHAT TO DRAFT</SectionTitle>
        {KINDS.map((k) => (
          <TouchableOpacity
            key={k.key}
            testID={`pick-kind-${k.key}`}
            style={[styles.pick, kind === k.key && styles.pickActive]}
            onPress={() => setKind(k.key)}
          >
            <Text style={[styles.pickText, kind === k.key && { color: colors.brand }]}>{k.label}</Text>
          </TouchableOpacity>
        ))}
        <SectionTitle>MODEL</SectionTitle>
        {models.map((m) => (
          <TouchableOpacity
            key={m.id}
            testID={`pick-model-${m.id}`}
            style={[styles.pick, model === m.id && styles.pickActive]}
            onPress={() => setModel(m.id)}
          >
            <Text style={[styles.pickText, model === m.id && { color: colors.brand }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
        <Field label="ANYTHING SPECIFIC? (OPTIONAL)" value={prompt} onChangeText={setPrompt} placeholder="Focus on her shoulder rehab" multiline testID="draft-prompt-input" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          testID="generate-draft-btn"
          title="Generate draft"
          onPress={generate}
          loading={busy}
          disabled={!client}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  note: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 19 },
  title: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.onSurfaceSecondary },
  body: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 20, marginTop: 2 },
  remove: { fontFamily: fonts.bold, fontSize: 12, color: colors.error, marginTop: 4 },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
  pick: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  pickActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  pickText: { fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.onSurface },
});
