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
  ScreenHeader,
  Sheet,
} from "@/src/components/studio/UI";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type Post = {
  id: string;
  kind: "post" | "announcement" | "event";
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  author: { user_id: string; name: string; is_coach: boolean };
  comment_count: number;
  reactions: Record<string, number>;
  my_reaction: string | null;
  can_delete: boolean;
  event?: { starts_at: string; location: string; url: string | null };
  rsvp_count?: number;
  my_rsvp?: string | null;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author: { name: string; is_coach: boolean };
  can_delete: boolean;
};

export default function Community() {
  const { user } = useAuth();
  const isCoach = user?.role === "coach";
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [kind, setKind] = useState<"post" | "announcement" | "event">("post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventPlace, setEventPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");

  const load = useCallback(async () => {
    try {
      setPosts(await api<Post[]>("/studio/community/feed"));
    } catch (e: any) {
      setError(e?.message ?? "Community unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const post = async () => {
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/studio/community/posts", {
        method: "POST",
        body: {
          kind,
          title: title.trim(),
          body: body.trim(),
          pinned: kind === "announcement",
          event:
            kind === "event"
              ? {
                  starts_at: new Date(eventDate || Date.now()).toISOString(),
                  location: eventPlace.trim(),
                }
              : null,
        },
      });
      setTitle("");
      setBody("");
      setEventDate("");
      setEventPlace("");
      setComposeOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not post");
    } finally {
      setBusy(false);
    }
  };

  const react = async (p: Post) => {
    await api(`/studio/community/posts/${p.id}/react`, { method: "POST", body: { emoji: "❤️" } });
    load();
  };

  const rsvp = async (p: Post) => {
    await api(`/studio/community/posts/${p.id}/rsvp`, {
      method: "POST",
      body: { status: p.my_rsvp === "going" ? "no" : "going" },
    });
    load();
  };

  const openComments = async (p: Post) => {
    setOpenPost(p);
    setCommentText("");
    try {
      setComments(await api<Comment[]>(`/studio/community/posts/${p.id}/comments`));
    } catch {
      setComments([]);
    }
  };

  const addComment = async () => {
    if (!openPost || !commentText.trim()) return;
    setBusy(true);
    try {
      await api(`/studio/community/posts/${openPost.id}/comments`, {
        method: "POST",
        body: { body: commentText.trim() },
      });
      setCommentText("");
      setComments(await api<Comment[]>(`/studio/community/posts/${openPost.id}/comments`));
      load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Post) => {
    setPosts((prev) => prev.filter((x) => x.id !== p.id));
    await api(`/studio/community/posts/${p.id}`, { method: "DELETE" }).catch(load);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Community"
        subtitle={`${posts.length} posts`}
        right={
          <TouchableOpacity testID="compose-btn" style={styles.iconBtn} onPress={() => setComposeOpen(true)}>
            <Ionicons name="create" size={22} color={colors.brand} />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {posts.length === 0 ? (
            <EmptyState
              testID="community-empty"
              icon="chatbubbles-outline"
              title="Quiet in here"
              body={isCoach ? "Post an announcement or schedule an event to kick things off." : "Say hello — your coach and the group will see it."}
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {posts.map((p) => (
                <Card key={p.id} testID={`post-${p.id}`} style={{ gap: spacing.sm }}>
                  <View style={styles.rowBetween}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{(p.author.name || "?").slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.author}>{p.author.name}</Text>
                        <Text style={styles.meta}>
                          {new Date(p.created_at).toLocaleDateString()}
                          {p.author.is_coach ? " · Coach" : ""}
                        </Text>
                      </View>
                    </View>
                    {p.kind !== "post" ? (
                      <Pill
                        label={p.kind === "announcement" ? "ANNOUNCEMENT" : "EVENT"}
                        tone={p.kind === "announcement" ? "gold" : "good"}
                      />
                    ) : null}
                  </View>

                  {p.title ? <Text style={styles.title}>{p.title}</Text> : null}
                  <Text style={styles.body}>{p.body}</Text>

                  {p.event ? (
                    <View style={styles.eventBox}>
                      <Ionicons name="calendar" size={16} color={colors.brand} />
                      <Text style={styles.eventText}>
                        {new Date(p.event.starts_at).toLocaleString()}
                        {p.event.location ? ` · ${p.event.location}` : ""}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.actions}>
                    <TouchableOpacity testID={`react-${p.id}`} style={styles.actionBtn} onPress={() => react(p)}>
                      <Ionicons
                        name={p.my_reaction ? "heart" : "heart-outline"}
                        size={18}
                        color={p.my_reaction ? colors.brand : colors.onSurfaceSecondary}
                      />
                      <Text style={styles.actionText}>{Object.values(p.reactions ?? {}).reduce((a, b) => a + b, 0)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID={`comments-${p.id}`} style={styles.actionBtn} onPress={() => openComments(p)}>
                      <Ionicons name="chatbubble-outline" size={17} color={colors.onSurfaceSecondary} />
                      <Text style={styles.actionText}>{p.comment_count}</Text>
                    </TouchableOpacity>
                    {p.kind === "event" ? (
                      <TouchableOpacity testID={`rsvp-${p.id}`} style={styles.actionBtn} onPress={() => rsvp(p)}>
                        <Ionicons
                          name={p.my_rsvp === "going" ? "checkmark-circle" : "checkmark-circle-outline"}
                          size={18}
                          color={p.my_rsvp === "going" ? colors.success : colors.onSurfaceSecondary}
                        />
                        <Text style={styles.actionText}>{p.rsvp_count ?? 0} going</Text>
                      </TouchableOpacity>
                    ) : null}
                    {p.can_delete ? (
                      <TouchableOpacity testID={`delete-post-${p.id}`} style={styles.actionBtn} onPress={() => remove(p)}>
                        <Ionicons name="trash-outline" size={16} color={colors.onSurfaceSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Sheet visible={composeOpen} onClose={() => setComposeOpen(false)} title="New post">
        {isCoach ? (
          <Segmented
            testIDPrefix="post-kind"
            value={kind}
            onChange={(k) => setKind(k as any)}
            options={[
              { key: "post", label: "Post" },
              { key: "announcement", label: "Announce" },
              { key: "event", label: "Event" },
            ]}
          />
        ) : null}
        {kind !== "post" ? (
          <Field label="TITLE" value={title} onChangeText={setTitle} placeholder="Live Q&A" testID="post-title-input" />
        ) : null}
        <Field label="MESSAGE" value={body} onChangeText={setBody} placeholder="What's on your mind?" multiline testID="post-body-input" />
        {kind === "event" ? (
          <>
            <Field label="WHEN (YYYY-MM-DD HH:MM)" value={eventDate} onChangeText={setEventDate} placeholder="2026-07-10 18:00" testID="event-date-input" />
            <Field label="WHERE" value={eventPlace} onChangeText={setEventPlace} placeholder="Zoom / Studio" testID="event-place-input" />
          </>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button testID="publish-post-btn" title="Publish" onPress={post} loading={busy} />
      </Sheet>

      <Sheet visible={!!openPost} onClose={() => setOpenPost(null)} title="Comments">
        {comments.length === 0 ? (
          <Text style={styles.meta}>No comments yet.</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} style={styles.comment}>
              <Text style={styles.author}>
                {c.author.name}
                {c.author.is_coach ? " · Coach" : ""}
              </Text>
              <Text style={styles.body}>{c.body}</Text>
            </View>
          ))
        )}
        <Field label="ADD A COMMENT" value={commentText} onChangeText={setCommentText} multiline testID="comment-input" />
        <Button testID="send-comment-btn" title="Send" onPress={addComment} loading={busy} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 14, color: colors.brand },
  author: { fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 11, color: colors.onSurfaceSecondary },
  title: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.onSurface },
  body: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurfaceTertiary, lineHeight: 21 },
  eventBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
  },
  eventText: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.brand },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.xl, marginTop: 2 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  actionText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurfaceSecondary },
  comment: { gap: 2, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error, marginBottom: spacing.sm },
});
