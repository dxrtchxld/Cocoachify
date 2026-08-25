import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  text: string;
  created_at: string;
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [peerName, setPeerName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const lastTs = useRef<string | null>(null);

  const load = useCallback(async (incremental: boolean) => {
    try {
      const after = incremental && lastTs.current ? `?after=${encodeURIComponent(lastTs.current)}` : "";
      const res = await api<{ peer: { name: string }; messages: Message[] }>(
        `/chat/${id}/messages${after}`,
      );
      setPeerName(res.peer.name);
      if (res.messages.length > 0) {
        lastTs.current = res.messages[res.messages.length - 1].created_at;
        setMessages((prev) => (incremental ? [...prev, ...res.messages] : res.messages));
      } else if (!incremental) {
        setMessages([]);
      }
    } catch {
      // retry next poll
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load(false);
    const interval = setInterval(() => load(true), 4000);
    return () => clearInterval(interval);
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setText("");
    try {
      const msg = await api<Message>(`/chat/${id}/messages`, { method: "POST", body: { text: body } });
      lastTs.current = msg.created_at;
      setMessages((prev) => [...prev, msg]);
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(peerName || "?")[0]?.toUpperCase()}</Text>
        </View>
        <Text style={styles.peerName}>{peerName || "Chat"}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : (
          <FlatList
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: spacing.xl, gap: spacing.sm }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>
                  No messages yet. Say hello — replies show up here.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.user_id;
              return (
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? { alignSelf: "flex-end", backgroundColor: colors.brand }
                      : { alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary },
                  ]}
                >
                  <Text style={[styles.bubbleText, mine && { color: colors.onBrand }]}>{item.text}</Text>
                  <Text style={[styles.bubbleTime, mine && { color: colors.onBrand, opacity: 0.7 }]}>
                    {new Date(item.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              );
            }}
          />
        )}

        <View style={[styles.inputRow, { paddingBottom: insets.bottom + spacing.md }]}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={colors.onSurfaceSecondary}
            multiline
          />
          <TouchableOpacity
            testID="send-btn"
            style={[styles.sendBtn, { backgroundColor: colors.brand }]}
            onPress={send}
            disabled={sending || !text.trim()}
          >
            <Ionicons name="send" size={18} color={colors.onBrand} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 15, color: colors.onBrandTertiary },
  peerName: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface },
  emptyWrap: { padding: spacing.xl, transform: [{ scaleY: -1 }] },
  emptyText: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, textAlign: "center" },
  bubble: {
    maxWidth: "80%",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bubbleText: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 20, color: colors.onSurface },
  bubbleTime: { fontFamily: fonts.regular, fontSize: 10, color: colors.onSurfaceSecondary, marginTop: 3, alignSelf: "flex-end" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    backgroundColor: colors.surfaceSecondary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
