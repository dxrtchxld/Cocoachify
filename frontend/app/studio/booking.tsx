import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, Share, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import {
  Card,
  EmptyState,
  Field,
  Loading,
  Pill,
  ScreenHeader,
  SectionTitle,
  Sheet,
} from "@/src/components/studio/UI";
import { BACKEND_URL, api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type SessionType = {
  id: string;
  name: string;
  duration_minutes: number;
  description: string;
  location: string;
};
type Window = { weekday: number; start: string; end: string };
type Settings = {
  enabled: boolean;
  slug: string;
  headline: string;
  intro: string;
  timezone: string;
  session_types: SessionType[];
  availability: Window[];
  slot_interval_minutes: number;
  buffer_minutes: number;
  lead_time_hours: number;
  max_days_ahead: number;
  public_path: string | null;
};
type Booking = {
  id: string;
  name: string;
  email: string;
  notes: string;
  session_type_name: string;
  duration_minutes: number;
  starts_at: string;
  status: string;
  client_id: string | null;
};

export default function StudioBooking() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [typeSheet, setTypeSheet] = useState(false);
  const [tName, setTName] = useState("");
  const [tMinutes, setTMinutes] = useState("45");
  const [tLocation, setTLocation] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        api<Settings>("/studio/booking/settings"),
        api<Booking[]>("/studio/booking/requests").catch(() => []),
      ]);
      setSettings(s);
      setBookings(b);
    } catch (e: any) {
      setError(e?.message ?? "Booking unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const save = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setError("");
    try {
      const saved = await api<Settings>("/studio/booking/settings", {
        method: "PUT",
        body: {
          enabled: next.enabled,
          slug: next.slug,
          headline: next.headline,
          intro: next.intro,
          timezone: next.timezone,
          session_types: next.session_types,
          availability: next.availability,
          slot_interval_minutes: next.slot_interval_minutes,
          buffer_minutes: next.buffer_minutes,
          lead_time_hours: next.lead_time_hours,
          max_days_ahead: next.max_days_ahead,
        },
      });
      setSettings(saved);
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (weekday: number) => {
    if (!settings) return;
    const has = settings.availability.some((w) => w.weekday === weekday);
    const availability = has
      ? settings.availability.filter((w) => w.weekday !== weekday)
      : [...settings.availability, { weekday, start: "09:00", end: "17:00" }];
    save({ availability });
  };

  const addType = () => {
    if (!settings || !tName.trim()) return;
    save({
      session_types: [
        ...settings.session_types,
        {
          id: "",
          name: tName.trim(),
          duration_minutes: parseInt(tMinutes, 10) || 45,
          description: "",
          location: tLocation.trim(),
        },
      ],
    });
    setTName("");
    setTMinutes("45");
    setTLocation("");
    setTypeSheet(false);
  };

  const decide = async (b: Booking, action: "confirm" | "decline" | "cancel") => {
    await api(`/studio/booking/requests/${b.id}/decision`, { method: "POST", body: { action } });
    load();
  };

  const link = settings?.public_path ? `${BACKEND_URL}${settings.public_path}` : "";
  const pending = bookings.filter((b) => b.status === "pending");
  const upcoming = bookings.filter((b) => b.status === "confirmed" && new Date(b.starts_at) >= new Date());

  return (
    <View style={styles.container}>
      <ScreenHeader title="Booking" subtitle="Share a link, approve the times that work" />
      {loading || !settings ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Card style={{ gap: spacing.md }}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Booking link</Text>
                <Text style={styles.meta}>
                  {settings.enabled ? "Live — anyone with the link can request a time" : "Off — the link returns nothing"}
                </Text>
              </View>
              <Switch
                testID="booking-enabled-switch"
                value={settings.enabled}
                onValueChange={(v) => save({ enabled: v })}
                trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                thumbColor={colors.onSurface}
              />
            </View>
            {link ? (
              <View style={styles.linkBox}>
                <Text style={styles.link} numberOfLines={1} testID="booking-link">
                  {link}
                </Text>
                <TouchableOpacity
                  testID="copy-booking-link"
                  style={styles.iconBtn}
                  onPress={async () => {
                    await Clipboard.setStringAsync(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                >
                  <Ionicons name={copied ? "checkmark" : "copy-outline"} size={17} color={colors.brand} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID="share-booking-link"
                  style={styles.iconBtn}
                  onPress={() => Share.share({ message: link, url: link })}
                >
                  <Ionicons name="share-outline" size={17} color={colors.brand} />
                </TouchableOpacity>
              </View>
            ) : null}
            <Field
              label="LINK HANDLE"
              value={settings.slug}
              onChangeText={(t) => setSettings({ ...settings, slug: t })}
              placeholder="jeremy-gillespie"
              testID="booking-slug-input"
            />
            <Field
              label="HEADLINE"
              value={settings.headline}
              onChangeText={(t) => setSettings({ ...settings, headline: t })}
              testID="booking-headline-input"
            />
            <Field
              label="INTRO"
              value={settings.intro}
              onChangeText={(t) => setSettings({ ...settings, intro: t })}
              multiline
              testID="booking-intro-input"
            />
            <Field
              label="TIME ZONE (IANA)"
              value={settings.timezone}
              onChangeText={(t) => setSettings({ ...settings, timezone: t })}
              placeholder="America/New_York"
              testID="booking-tz-input"
            />
            <Button testID="save-booking-btn" title="Save booking page" onPress={() => save({})} loading={saving} />
          </Card>

          <SectionTitle
            right={
              <TouchableOpacity testID="add-session-type" onPress={() => setTypeSheet(true)}>
                <Text style={styles.action}>Add</Text>
              </TouchableOpacity>
            }
          >
            SESSION TYPES
          </SectionTitle>
          <View style={{ gap: spacing.sm }}>
            {settings.session_types.map((t) => (
              <Card key={t.id || t.name} testID={`session-type-${t.id}`} style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{t.name}</Text>
                  <Text style={styles.meta}>
                    {t.duration_minutes} min{t.location ? ` · ${t.location}` : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  testID={`remove-type-${t.id}`}
                  onPress={() => save({ session_types: settings.session_types.filter((x) => x.id !== t.id) })}
                >
                  <Text style={styles.remove}>Remove</Text>
                </TouchableOpacity>
              </Card>
            ))}
          </View>

          <SectionTitle>WEEKLY AVAILABILITY</SectionTitle>
          <View style={styles.days}>
            {DAYS.map((d, i) => {
              const on = settings.availability.some((w) => w.weekday === i);
              return (
                <TouchableOpacity
                  key={d}
                  testID={`day-${i}`}
                  onPress={() => toggleDay(i)}
                  style={[styles.day, on && styles.dayOn]}
                >
                  <Text style={[styles.dayText, on && styles.dayTextOn]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {[...settings.availability]
              .sort((a, b) => a.weekday - b.weekday)
              .map((w) => (
                <Card key={w.weekday} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <Text style={[styles.cardTitle, { width: 44 }]}>{DAYS[w.weekday]}</Text>
                  <Field
                    style={{ flex: 1 }}
                    value={w.start}
                    testID={`start-${w.weekday}`}
                    onChangeText={(t) =>
                      setSettings({
                        ...settings,
                        availability: settings.availability.map((x) =>
                          x.weekday === w.weekday ? { ...x, start: t } : x,
                        ),
                      })
                    }
                  />
                  <Text style={styles.meta}>to</Text>
                  <Field
                    style={{ flex: 1 }}
                    value={w.end}
                    testID={`end-${w.weekday}`}
                    onChangeText={(t) =>
                      setSettings({
                        ...settings,
                        availability: settings.availability.map((x) =>
                          x.weekday === w.weekday ? { ...x, end: t } : x,
                        ),
                      })
                    }
                  />
                </Card>
              ))}
          </View>

          <SectionTitle>RULES</SectionTitle>
          <Card style={{ gap: spacing.md }}>
            <Field
              label="SLOT INTERVAL (MIN)"
              value={String(settings.slot_interval_minutes)}
              keyboardType="numeric"
              onChangeText={(t) => setSettings({ ...settings, slot_interval_minutes: parseInt(t, 10) || 30 })}
              testID="interval-input"
            />
            <Field
              label="BUFFER BETWEEN SESSIONS (MIN)"
              value={String(settings.buffer_minutes)}
              keyboardType="numeric"
              onChangeText={(t) => setSettings({ ...settings, buffer_minutes: parseInt(t, 10) || 0 })}
              testID="buffer-input"
            />
            <Field
              label="MINIMUM NOTICE (HOURS)"
              value={String(settings.lead_time_hours)}
              keyboardType="numeric"
              onChangeText={(t) => setSettings({ ...settings, lead_time_hours: parseInt(t, 10) || 0 })}
              testID="lead-input"
            />
            <Field
              label="BOOKABLE DAYS AHEAD"
              value={String(settings.max_days_ahead)}
              keyboardType="numeric"
              onChangeText={(t) => setSettings({ ...settings, max_days_ahead: parseInt(t, 10) || 30 })}
              testID="ahead-input"
            />
            <Button testID="save-rules-btn" title="Save" onPress={() => save({})} loading={saving} />
          </Card>

          <SectionTitle>REQUESTS</SectionTitle>
          {pending.length === 0 ? (
            <EmptyState
              testID="bookings-empty"
              icon="calendar-outline"
              title="No requests waiting"
              body="Share your booking link and requests will land here."
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {pending.map((b) => (
                <Card key={b.id} testID={`booking-${b.id}`} style={{ gap: spacing.sm }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{b.name}</Text>
                    <Pill label="PENDING" tone="warn" />
                  </View>
                  <Text style={styles.meta}>
                    {b.session_type_name} · {b.duration_minutes} min ·{" "}
                    {new Date(b.starts_at).toLocaleString()}
                  </Text>
                  <Text style={styles.meta}>{b.email}</Text>
                  {b.notes ? <Text style={styles.body}>{b.notes}</Text> : null}
                  <View style={{ flexDirection: "row", gap: spacing.xl }}>
                    <TouchableOpacity testID={`confirm-${b.id}`} onPress={() => decide(b, "confirm")}>
                      <Text style={styles.action}>Confirm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID={`decline-${b.id}`} onPress={() => decide(b, "decline")}>
                      <Text style={styles.remove}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ))}
            </View>
          )}

          {upcoming.length > 0 ? (
            <>
              <SectionTitle>UPCOMING</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                {upcoming.map((b) => (
                  <Card key={b.id} testID={`upcoming-${b.id}`} style={{ gap: 4 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.cardTitle}>{b.name}</Text>
                      <Pill label="CONFIRMED" tone="good" />
                    </View>
                    <Text style={styles.meta}>
                      {b.session_type_name} · {new Date(b.starts_at).toLocaleString()}
                    </Text>
                    <View style={{ flexDirection: "row", gap: spacing.xl }}>
                      <TouchableOpacity testID={`cancel-${b.id}`} onPress={() => decide(b, "cancel")}>
                        <Text style={styles.remove}>Cancel</Text>
                      </TouchableOpacity>
                      {b.client_id ? (
                        <TouchableOpacity
                          testID={`prep-session-${b.id}`}
                          onPress={() =>
                            router.push({
                              pathname: "/studio/assistant",
                              params: { clientId: b.client_id as string, kind: "agenda" },
                            })
                          }
                        >
                          <Text style={styles.action}>✨ Prep with AI</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </Card>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}

      <Sheet visible={typeSheet} onClose={() => setTypeSheet(false)} title="New session type">
        <Field label="NAME" value={tName} onChangeText={setTName} placeholder="Discovery call" testID="type-name-input" />
        <Field label="MINUTES" value={tMinutes} onChangeText={setTMinutes} keyboardType="numeric" testID="type-minutes-input" />
        <Field label="LOCATION / LINK" value={tLocation} onChangeText={setTLocation} placeholder="Zoom" testID="type-location-input" />
        <Button testID="save-type-btn" title="Add session type" onPress={addType} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardTitle: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.onSurfaceSecondary },
  body: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 19 },
  action: { fontFamily: fonts.bold, fontSize: 12, color: colors.brand },
  remove: { fontFamily: fonts.bold, fontSize: 12, color: colors.error },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error, marginBottom: spacing.sm },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingLeft: spacing.md,
  },
  link: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.brandSecondary },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  days: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  day: {
    minWidth: 52,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
  },
  dayOn: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  dayText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurfaceSecondary },
  dayTextOn: { color: colors.brand },
});
