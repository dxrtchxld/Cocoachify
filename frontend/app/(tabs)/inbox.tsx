import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type CheckIn = {
  id: string;
  user_id: string;
  client_name: string | null;
  session_name: string | null;
  duration_minutes: number | null;
  rpe: number | null;
  notes: string | null;
  date: string;
  urgency: "urgent" | "watch" | "normal";
  reviewed: boolean;
  coach_reply?: string | null;
};

const FILTERS = ["all", "new", "urgent", "watch"] as const;

export default function Inbox() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api<CheckIn[]>("/coach/inbox"));
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const review = async (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, reviewed: true } : i)));
    try {
      await api(`/coach/inbox/${id}/review`, { method: "POST" });
    } catch {
      load();
    }
  };

  const openReply = (id: string) => {
    setReplyingId((cur) => (cur === id ? null : id));
    setReplyText("");
  };

  const sendReply = async (id: string) => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await api(`/coach/inbox/${id}/reply`, { method: "POST", body: { text: replyText.trim() } });
      const sent = replyText.trim();
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, reviewed: true, coach_reply: sent } : i)),
      );
      setReplyingId(null);
      setReplyText("");
    } catch {
      // keep composer open
    } finally {
      setSending(false);
    }
  };

  const counts = {
    all: items.length,
    new: items.filter((i) => !i.reviewed).length,
    urgent: items.filter((i) => i.urgency === "urgent").length,
    watch: items.filter((i) => i.urgency === "watch").length,
  };

  const filtered = items.filter((i) => {
    if (filter === "new") return !i.reviewed;
    if (filter === "urgent") return i.urgency === "urgent";
    if (filter === "watch") return i.urgency === "watch";
    return true;
  });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>INBOX</Text>
        <Text style={styles.sub}>Client check-ins waiting for your eyes.</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            testID={`filter-${f}`}
            style={[styles.filterChip, filter === f && { backgroundColor: colors.brandTertiary, borderColor: colors.brand }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && { color: colors.onSurface }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="mail-open-outline" size={44} color={colors.onSurfaceSecondary} />
          <Text style={styles.emptyText}>
            {filter === "all" ? "No check-ins yet." : `Nothing in ${filter}.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          renderItem={({ item }) => (
            <View style={[styles.card, !item.reviewed && styles.cardNew]}>
              <View style={styles.cardTop}>
                <Text style={styles.clientName}>{item.client_name}</Text>
                {item.urgency !== "normal" && (
                  <View
                    style={[
                      styles.urgencyChip,
                      item.urgency === "urgent"
                        ? { backgroundColor: "rgba(255,69,58,0.15)" }
                        : { backgroundColor: "rgba(255,214,10,0.12)" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.urgencyText,
                        { color: item.urgency === "urgent" ? colors.error : colors.warning },
                      ]}
                    >
                      {item.urgency.toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.date}>{formatDate(item.date)}</Text>
              </View>
              <Text style={styles.sessionLine}>
                {item.session_name ?? "Workout"}
                {item.duration_minutes ? ` · ${item.duration_minutes} min` : ""}
                {item.rpe ? ` · RPE ${item.rpe}` : ""}
              </Text>
              {item.notes ? <Text style={styles.notes}>&ldquo;{item.notes}&rdquo;</Text> : null}
              {item.coach_reply ? (
                <View style={styles.replyPreview}>
                  <Ionicons name="return-down-forward" size={14} color={colors.success} />
                  <Text style={styles.replyPreviewText}>You replied: {item.coach_reply}</Text>
                </View>
              ) : null}
              <View style={styles.actions}>
                <TouchableOpacity
                  testID={`reply-${item.id}`}
                  style={styles.actionBtn}
                  onPress={() => openReply(item.id)}
                >
                  <Ionicons name="chatbubble-ellipses" size={15} color={colors.brand} />
                  <Text style={[styles.actionText, { color: colors.brand }]}>
                    {replyingId === item.id ? "Cancel" : "Reply"}
                  </Text>
                </TouchableOpacity>
                {!item.reviewed ? (
                  <TouchableOpacity
                    testID={`review-${item.id}`}
                    style={styles.actionBtn}
                    onPress={() => review(item.id)}
                  >
                    <Ionicons name="checkmark-done" size={16} color={colors.onSurfaceSecondary} />
                    <Text style={styles.actionText}>Mark reviewed</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.actionBtn}>
                    <Ionicons name="checkmark-done" size={16} color={colors.success} />
                    <Text style={[styles.actionText, { color: colors.success }]}>Reviewed</Text>
                  </View>
                )}
              </View>
              {replyingId === item.id && (
                <View style={styles.composer}>
                  <TextInput
                    testID={`reply-input-${item.id}`}
                    style={styles.replyInput}
                    value={replyText}
                    onChangeText={setReplyText}
                    placeholder={`Message ${item.client_name ?? "client"}...`}
                    placeholderTextColor={colors.onSurfaceSecondary}
                    multiline
                    autoFocus
                  />
                  <TouchableOpacity
                    testID={`send-reply-${item.id}`}
                    style={[styles.sendBtn, (!replyText.trim() || sending) && { opacity: 0.5 }]}
                    onPress={() => sendReply(item.id)}
                    disabled={!replyText.trim() || sending}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color={colors.onBrand} />
                    ) : (
                      <Ionicons name="send" size={16} color={colors.onBrand} />
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, letterSpacing: 1 },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  filterChip: {
    paddingHorizontal: spacing.md,
    minHeight: 38,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  filterText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurfaceSecondary },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  emptyText: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  cardNew: { borderLeftWidth: 3, borderLeftColor: colors.brand },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  clientName: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  urgencyChip: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  urgencyText: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.8 },
  date: { fontFamily: fonts.medium, fontSize: 11, color: colors.onSurfaceSecondary },
  sessionLine: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 4 },
  notes: {
    fontFamily: fonts.regular,
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
    color: colors.onSurfaceSecondary,
    marginTop: 6,
  },
  actions: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.md },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32 },
  actionText: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.onSurfaceSecondary },
  replyPreview: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: "rgba(50,215,75,0.08)",
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  replyPreviewText: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 17 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  replyInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 14,
    backgroundColor: colors.surface,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});
