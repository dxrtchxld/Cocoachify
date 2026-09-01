import { useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

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
type CheckinLog = {
  id: string;
  log_type: string;
  session_name: string | null;
  duration_minutes: number | null;
  rpe: number | null;
  notes: string | null;
  date: string;
};

const KINDS: { key: string; label: string }[] = [
  { key: "agenda", label: "Session agenda" },
  { key: "checkin_summary", label: "Check-in summary" },
  { key: "followup", label: "Follow-up ideas" },
];

export default function AssistantScreen() {
  const params = useLocalSearchParams<{ clientId?: string; kind?: string }>();
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
  const [preview, setPreview] = useState<CheckinLog[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const handledParam = useRef<string | null>(null);

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

  const loadPreview = async (clientId: string) => {
    setPreviewLoading(true);
    try {
      const detail = await api<{ logs: CheckinLog[] }>(`/coach/clients/${clientId}`);
      setPreview((detail.logs ?? []).slice(0, 3));
    } catch {
      setPreview([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Deep-link entry: coming from "Prep with AI" on a client or booking screen.
  useEffect(() => {
    if (loading || !params.clientId) return;
    if (handledParam.current === params.clientId) return;
    handledParam.current = params.clientId;
    const target = clients.find((c) => c.user_id === params.clientId);
    if (!target) return;
    if (hasConsent(target.user_id)) {
      setClient(target);
      setKind(KINDS.some((k) => k.key === params.kind) ? (params.kind as string) : "agenda");
      setModel(models.find((m) => m.default)?.id ?? "claude-sonnet-4-6");
      setOpen(true);
      loadPreview(target.user_id);
    } else {
      setError(`${target.name} hasn't turned on assistant consent yet.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, params.clientId, clients, consents, models]);

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
              const first = consented[0] ?? null;
              setClient(first);
              setModel(models.find((m) => m.default)?.id ?? "claude-sonnet-4-6");
              setPreview([]);
              if (first) loadPreview(first.user_id);
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
              onPress={() => {
                setClient(c);
                setPreview([]);
                loadPreview(c.user_id);
              }}
            >
              <Text style={[styles.pickText, client?.user_id === c.user_id && { color: colors.brand }]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))
        )}

        {client ? (
          <>
            <SectionTitle>RECENT CHECK-INS (USED FOR THE DRAFT)</SectionTitle>
            {previewLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.sm }} />
            ) : preview.length === 0 ? (
              <Text style={styles.meta}>No recent check-ins yet — the draft will lean on intake data.</Text>
            ) : (
              <View style={{ gap: spacing.xs }}>
                {preview.map((l) => (
                  <Card key={l.id} testID={`preview-log-${l.id}`} style={{ gap: 2 }}>
                    <Text style={styles.previewTitle}>
                      {l.log_type === "body" ? "Body log" : l.session_name ?? "Workout"} ·{" "}
                      {new Date(l.date).toLocaleDateString()}
                    </Text>
                    {l.notes ? (
                      <Text style={styles.previewNotes} numberOfLines={2}>
                        &ldquo;{l.notes}&rdquo;
                      </Text>
                    ) : null}
                  </Card>
                ))}
              </View>
            )}
          </>
        ) : null}

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
  previewTitle: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.onSurface },
  previewNotes: { fontFamily: fonts.regular, fontSize: 12, fontStyle: "italic", color: colors.onSurfaceTertiary },
});
