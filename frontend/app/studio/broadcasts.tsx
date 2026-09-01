import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import { Card, EmptyState, Field, Loading, Row, ScreenHeader, SectionTitle, Sheet } from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type Segment = { id: string; name: string; size: number };
type Client = { user_id: string; name: string };
type Broadcast = { id: string; title: string; message: string; sent_count: number; created_at: string };

export default function Broadcasts() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [toCommunity, setToCommunity] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, c, h] = await Promise.all([
        api<Segment[]>("/studio/segments").catch(() => []),
        api<Client[]>("/coach/clients").catch(() => []),
        api<Broadcast[]>("/studio/broadcasts").catch(() => []),
      ]);
      setSegments(s);
      setClients(c);
      setHistory(h);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ sent_count: number; posted_to_community: boolean }>("/studio/broadcasts", {
        method: "POST",
        body: {
          title: title.trim(),
          message: message.trim(),
          segment_id: segment,
          client_ids: picked,
          send_as_message: true,
          post_to_community: toCommunity,
        },
      });
      setResult(
        `Sent to ${res.sent_count} client${res.sent_count === 1 ? "" : "s"}${res.posted_to_community ? " and pinned in the community" : ""}.`,
      );
      setTitle("");
      setMessage("");
      setPicked([]);
      setSegment(null);
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Broadcasts"
        subtitle="One message to a segment or a picked list"
        right={
          <TouchableOpacity testID="new-broadcast-btn" style={styles.iconBtn} onPress={() => setOpen(true)}>
            <Ionicons name="megaphone" size={22} color={colors.brand} />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {result ? <Text style={styles.ok}>{result}</Text> : null}
          {history.length === 0 ? (
            <EmptyState
              testID="broadcasts-empty"
              icon="megaphone-outline"
              title="No broadcasts yet"
              body="Send an update to a whole segment at once. It lands in each client's chat, and can pin in the community too."
            />
          ) : (
            <>
              <SectionTitle>SENT</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                {history.map((b) => (
                  <Card key={b.id} testID={`broadcast-${b.id}`} style={{ gap: 4 }}>
                    {b.title ? <Text style={styles.title}>{b.title}</Text> : null}
                    <Text style={styles.body}>{b.message}</Text>
                    <Text style={styles.meta}>
                      {b.sent_count} recipients · {new Date(b.created_at).toLocaleDateString()}
                    </Text>
                  </Card>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="New broadcast">
        <Field label="TITLE (OPTIONAL)" value={title} onChangeText={setTitle} placeholder="New cohort starts Monday" testID="broadcast-title-input" />
        <Field label="MESSAGE" value={message} onChangeText={setMessage} multiline testID="broadcast-message-input" />
        <SectionTitle>SEND TO A SEGMENT</SectionTitle>
        {segments.length === 0 ? (
          <Text style={styles.meta}>No segments yet — create one in Contacts & Leads.</Text>
        ) : (
          segments.map((s) => (
            <Row
              key={s.id}
              testID={`bc-segment-${s.id}`}
              icon={segment === s.id ? "radio-button-on" : "radio-button-off"}
              title={s.name}
              subtitle={`${s.size} contacts`}
              onPress={() => setSegment(segment === s.id ? null : s.id)}
            />
          ))
        )}
        <SectionTitle>OR PICK CLIENTS</SectionTitle>
        {clients.map((c) => (
          <Row
            key={c.user_id}
            testID={`bc-client-${c.user_id}`}
            icon={picked.includes(c.user_id) ? "checkbox" : "square-outline"}
            title={c.name}
            onPress={() =>
              setPicked((prev) => (prev.includes(c.user_id) ? prev.filter((x) => x !== c.user_id) : [...prev, c.user_id]))
            }
          />
        ))}
        <Row
          testID="bc-community-toggle"
          icon={toCommunity ? "checkbox" : "square-outline"}
          title="Also pin in the community"
          onPress={() => setToCommunity(!toCommunity)}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button testID="send-broadcast-btn" title="Send broadcast" onPress={send} loading={busy} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  body: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.onSurfaceSecondary },
  ok: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.success, marginBottom: spacing.md },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
});
