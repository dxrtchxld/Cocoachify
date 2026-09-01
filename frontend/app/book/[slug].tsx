import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { Card, EmptyState, Field, Loading, Pill } from "@/src/components/studio/UI";
import { useAuth } from "@/src/context/AuthContext";
import { BACKEND_URL, getToken, mediaUrl } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type SessionType = { id: string; name: string; duration_minutes: number; description: string; location: string };
type Page = {
  slug: string;
  headline: string;
  intro: string;
  timezone: string;
  session_types: SessionType[];
  max_days_ahead: number;
  coach: { name: string | null; brand_logo: string | null; specialty: string | null; picture: string | null };
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function PublicBooking() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [day, setDay] = useState<Date>(new Date());
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ starts_at: string; session_type_name: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/public/book/${slug}`);
        if (!res.ok) throw new Error("not found");
        const data: Page = await res.json();
        setPage(data);
        setTypeId(data.session_types[0]?.id ?? null);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
  }, [user]);

  const loadSlots = useCallback(async () => {
    if (!typeId) return;
    setSlotsLoading(true);
    setPicked(null);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/public/book/${slug}/slots?date=${dayKey(day)}&session_type_id=${typeId}`,
      );
      const data = await res.json();
      setSlots(res.ok ? data.slots ?? [] : []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, day, typeId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/public/book/${slug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_type_id: typeId,
          starts_at: picked,
          name: name.trim(),
          email: email.trim() || null,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Could not book that time");
      setDone({ starts_at: data.starts_at, session_type_name: data.session_type_name });
    } catch (e: any) {
      setError(e?.message ?? "Could not book that time");
      loadSlots();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Loading />
      </View>
    );
  }

  if (notFound || !page) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
        <EmptyState
          testID="booking-not-found"
          icon="calendar-outline"
          title="This booking page isn't available"
          body="The link may be turned off or no longer exists."
        />
      </View>
    );
  }

  if (done) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, padding: spacing.lg }]}>
        <Card testID="booking-done" style={{ alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxl }}>
          <Ionicons name="checkmark-circle" size={54} color={colors.brand} />
          <Text style={styles.h1}>Request sent</Text>
          <Text style={styles.body}>
            {page.coach.name ?? "Your coach"} will confirm your {done.session_type_name} on{" "}
            {new Date(done.starts_at).toLocaleString()}.
          </Text>
          <Button testID="booking-done-btn" title="Done" onPress={() => router.replace("/")} />
        </Card>
      </View>
    );
  }

  const days = Array.from({ length: Math.min(page.max_days_ahead, 21) }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  const logo = mediaUrl(page.coach.brand_logo);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxxl }}
      >
        <View style={styles.hero}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Ionicons name="calendar" size={30} color={colors.brand} />
          )}
          <Text style={styles.kicker}>{(page.coach.name ?? "COACH").toUpperCase()}</Text>
          <Text style={styles.h1}>{page.headline || "Book a session"}</Text>
          {page.intro ? <Text style={styles.body}>{page.intro}</Text> : null}
          <Pill label={page.timezone.toUpperCase()} tone="gold" />
        </View>

        <Text style={styles.label}>SESSION TYPE</Text>
        <View style={styles.chips}>
          {page.session_types.map((t) => (
            <TouchableOpacity
              key={t.id}
              testID={`book-type-${t.id}`}
              onPress={() => setTypeId(t.id)}
              style={[styles.chip, typeId === t.id && styles.chipOn]}
            >
              <Text style={[styles.chipText, typeId === t.id && styles.chipTextOn]}>
                {t.name} · {t.duration_minutes}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>DAY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {days.map((d) => {
            const on = dayKey(d) === dayKey(day);
            return (
              <TouchableOpacity
                key={dayKey(d)}
                testID={`book-day-${dayKey(d)}`}
                onPress={() => setDay(d)}
                style={[styles.dayChip, on && styles.chipOn]}
              >
                <Text style={[styles.dayDow, on && styles.chipTextOn]}>
                  {d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}
                </Text>
                <Text style={[styles.dayNum, on && styles.chipTextOn]}>{d.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>AVAILABLE TIMES</Text>
        {slotsLoading ? (
          <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.lg }} />
        ) : slots.length === 0 ? (
          <Text style={styles.body} testID="no-slots">
            No open times on this day — try another.
          </Text>
        ) : (
          <View style={styles.chips}>
            {slots.map((s) => (
              <TouchableOpacity
                key={s}
                testID={`slot-${s}`}
                onPress={() => setPicked(s)}
                style={[styles.chip, picked === s && styles.chipOn]}
              >
                <Text style={[styles.chipText, picked === s && styles.chipTextOn]}>
                  {new Date(s).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {picked ? (
          <Card style={{ gap: spacing.md, marginTop: spacing.lg }}>
            <Text style={styles.cardTitle}>
              {new Date(picked).toLocaleString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
            {!user ? (
              <>
                <Field label="YOUR NAME" value={name} onChangeText={setName} testID="book-name-input" />
                <Field
                  label="EMAIL"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  testID="book-email-input"
                />
              </>
            ) : null}
            <Field
              label="ANYTHING I SHOULD KNOW?"
              value={notes}
              onChangeText={setNotes}
              multiline
              testID="book-notes-input"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button testID="book-submit-btn" title="Request this time" onPress={submit} loading={busy} />
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
  logo: { width: 120, height: 42 },
  kicker: { fontFamily: fonts.bold, fontSize: 10, color: colors.brand, letterSpacing: 2 },
  h1: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, textAlign: "center" },
  body: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  label: {
    fontFamily: fonts.displayBold,
    fontSize: 11.5,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.4,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipOn: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  chipText: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.onSurfaceSecondary },
  chipTextOn: { color: colors.brand },
  dayChip: {
    width: 58,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  dayDow: { fontFamily: fonts.semiBold, fontSize: 10, color: colors.onSurfaceSecondary, letterSpacing: 0.8 },
  dayNum: { fontFamily: fonts.displayBold, fontSize: 17, color: colors.onSurface },
  cardTitle: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.brand },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
});
