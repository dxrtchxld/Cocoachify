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
  ProgressBar,
  ScreenHeader,
  SectionTitle,
  Sheet,
} from "@/src/components/studio/UI";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type Challenge = {
  id: string;
  title: string;
  description: string;
  metric: string;
  metric_label: string;
  target: number;
  starts_at: string;
  ends_at: string;
  status: string;
  joined: boolean;
  participant_count: number;
};
type Row = { user_id: string; name: string; score: number; rank: number; is_me: boolean };

export default function Challenges() {
  const { user } = useAuth();
  const isCoach = user?.role === "coach";
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [board, setBoard] = useState<{ challenge: Challenge; rows: Row[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState("workouts");
  const [target, setTarget] = useState("12");
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setChallenges(await api<Challenge[]>("/studio/challenges"));
    } catch (e: any) {
      setError(e?.message ?? "Challenges unavailable");
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
    setBusy(true);
    setError("");
    try {
      await api("/studio/challenges", {
        method: "POST",
        body: {
          title: title.trim(),
          description: description.trim(),
          metric,
          target: parseInt(target, 10) || 0,
          days: parseInt(days, 10) || 14,
        },
      });
      setTitle("");
      setDescription("");
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not create challenge");
    } finally {
      setBusy(false);
    }
  };

  const join = async (c: Challenge) => {
    await api(`/studio/challenges/${c.id}/join`, { method: "POST" });
    load();
  };

  const openBoard = async (c: Challenge) => {
    try {
      setBoard(await api(`/studio/challenges/${c.id}/leaderboard`));
    } catch {
      setBoard(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Challenges"
        subtitle="Group goals with a live leaderboard"
        right={
          isCoach ? (
            <TouchableOpacity testID="new-challenge-btn" style={styles.iconBtn} onPress={() => setOpen(true)}>
              <Ionicons name="add" size={26} color={colors.brand} />
            </TouchableOpacity>
          ) : null
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {challenges.length === 0 ? (
            <EmptyState
              testID="challenges-empty"
              icon="trophy-outline"
              title="No challenges yet"
              body={isCoach ? "Start a challenge and watch the group pull each other along." : "Your coach hasn't started a challenge yet."}
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {challenges.map((c) => (
                <Card key={c.id} testID={`challenge-${c.id}`} style={{ gap: spacing.sm }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>{c.title}</Text>
                    <Pill
                      label={c.status.toUpperCase()}
                      tone={c.status === "live" ? "good" : c.status === "upcoming" ? "gold" : "neutral"}
                    />
                  </View>
                  {c.description ? <Text style={styles.body}>{c.description}</Text> : null}
                  <Text style={styles.meta}>
                    {c.metric_label}
                    {c.target ? ` · target ${c.target}` : ""} · {c.participant_count} joined · ends{" "}
                    {new Date(c.ends_at).toLocaleDateString()}
                  </Text>
                  <View style={{ flexDirection: "row", gap: spacing.lg }}>
                    <TouchableOpacity testID={`board-${c.id}`} onPress={() => openBoard(c)}>
                      <Text style={styles.action}>Leaderboard</Text>
                    </TouchableOpacity>
                    {!isCoach ? (
                      <TouchableOpacity testID={`join-${c.id}`} onPress={() => join(c)}>
                        <Text style={styles.action}>{c.joined ? "Leave" : "Join challenge"}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        testID={`delete-challenge-${c.id}`}
                        onPress={async () => {
                          await api(`/studio/challenges/${c.id}`, { method: "DELETE" });
                          load();
                        }}
                      >
                        <Text style={styles.remove}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Sheet visible={!!board} onClose={() => setBoard(null)} title={board?.challenge.title ?? "Leaderboard"}>
        {board?.rows.length ? (
          board.rows.map((r) => (
            <View key={r.user_id} style={[styles.boardRow, r.is_me && styles.boardRowMe]}>
              <Text style={styles.rank}>{r.rank}</Text>
              <Text style={[styles.name, r.is_me && { color: colors.brand }]}>{r.name}</Text>
              <Text style={styles.score}>{r.score}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.meta}>Nobody has joined yet.</Text>
        )}
        {board?.challenge.target ? (
          <>
            <SectionTitle>TOP PROGRESS TO TARGET</SectionTitle>
            <ProgressBar
              pct={
                board.rows.length && board.challenge.target
                  ? Math.min(100, (board.rows[0].score / board.challenge.target) * 100)
                  : 0
              }
            />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={open} onClose={() => setOpen(false)} title="New challenge">
        <Field label="TITLE" value={title} onChangeText={setTitle} placeholder="30 workouts in 30 days" testID="challenge-title-input" />
        <Field label="DESCRIPTION" value={description} onChangeText={setDescription} multiline testID="challenge-desc-input" />
        <Segmented
          testIDPrefix="challenge-metric"
          value={metric}
          onChange={setMetric}
          options={[
            { key: "workouts", label: "Workouts" },
            { key: "minutes", label: "Minutes" },
            { key: "checkins", label: "Check-ins" },
            { key: "lessons", label: "Lessons" },
          ]}
        />
        <Field label="TARGET" value={target} onChangeText={setTarget} keyboardType="numeric" testID="challenge-target-input" />
        <Field label="LENGTH IN DAYS" value={days} onChangeText={setDays} keyboardType="numeric" testID="challenge-days-input" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button testID="save-challenge-btn" title="Start challenge" onPress={create} loading={busy} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 16, color: colors.onSurface },
  body: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.brandSecondary },
  action: { fontFamily: fonts.bold, fontSize: 12, color: colors.brand },
  remove: { fontFamily: fonts.bold, fontSize: 12, color: colors.error },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error, marginBottom: spacing.sm },
  boardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  boardRowMe: { backgroundColor: colors.brandTertiary, borderRadius: 8, paddingHorizontal: spacing.sm },
  rank: { width: 24, fontFamily: fonts.displayBold, fontSize: 15, color: colors.onSurfaceSecondary },
  name: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14, color: colors.onSurface },
  score: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.brand },
});
