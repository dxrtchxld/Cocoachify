import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { Card, Field, Loading, Pill, SectionTitle } from "@/src/components/studio/UI";
import { BACKEND_URL, mediaUrl } from "@/src/lib/api";
import { colors, coverFor, fonts, spacing } from "@/src/theme";

type PublicPage = {
  course: {
    title: string;
    subtitle: string;
    description: string;
    category: string;
    cover_image: string | null;
    pricing_type: string;
    price: number;
    lesson_count: number;
  };
  coach: { name: string | null; brand_logo: string | null; theme_color: string | null };
  landing: {
    headline: string;
    subheadline: string;
    highlights: string[];
    testimonials: { name: string; text: string }[];
    cta_label: string;
  };
  outline: { title: string; lessons: { title: string; duration_minutes: number }[] }[];
  lead_form: { id: string; title: string; intro: string; fields: { key: string; label: string }[]; success_message: string } | null;
};

export default function PublicLanding() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<PublicPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/courses/${slug}`);
      if (!res.ok) throw new Error("Page not found");
      setPage(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "Page not found");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!page?.lead_form || !email.trim()) {
      setError("Enter your email to apply");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: page.lead_form.id,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          answers,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail ?? "Could not submit");
      setSent(json.message ?? page.lead_form.success_message);
    } catch (e: any) {
      setError(e?.message ?? "Could not submit");
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

  if (!page) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="link-outline" size={40} color={colors.onSurfaceSecondary} />
        <Text style={styles.notFound}>{error || "This page isn't available."}</Text>
      </View>
    );
  }

  const { course, coach, landing, outline, lead_form: form } = page;
  const logo = mediaUrl(coach.brand_logo);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
    >
      <View style={styles.hero}>
        <Image source={{ uri: coverFor(course.category, course.cover_image) }} style={styles.heroImage} />
        <View style={styles.heroOverlay} />
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" /> : null}
          <Text style={styles.kicker}>{(coach.name ?? "COACHING").toUpperCase()}</Text>
          <Text style={styles.headline}>{landing.headline || course.title}</Text>
          {landing.subheadline || course.subtitle ? (
            <Text style={styles.subheadline}>{landing.subheadline || course.subtitle}</Text>
          ) : null}
          <View style={styles.heroMeta}>
            <Pill label={`${course.lesson_count} LESSONS`} tone="gold" />
            <Pill
              label={course.pricing_type === "free" ? "FREE" : `$${course.price}`}
              tone="good"
            />
          </View>
        </View>
      </View>

      <View style={{ padding: spacing.lg }}>
        {course.description ? (
          <Card>
            <Text style={styles.body}>{course.description}</Text>
          </Card>
        ) : null}

        {landing.highlights?.length ? (
          <>
            <SectionTitle>WHAT YOU GET</SectionTitle>
            <View style={{ gap: spacing.sm }}>
              {landing.highlights.map((h, i) => (
                <View key={i} style={styles.highlight}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                  <Text style={styles.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {outline?.length ? (
          <>
            <SectionTitle>INSIDE THE PROGRAM</SectionTitle>
            <View style={{ gap: spacing.md }}>
              {outline.map((sec, i) => (
                <Card key={i} style={{ gap: 6 }}>
                  <Text style={styles.secTitle}>{sec.title}</Text>
                  {sec.lessons.map((l, j) => (
                    <Text key={j} style={styles.lessonLine}>
                      • {l.title}
                      {l.duration_minutes ? ` (${l.duration_minutes} min)` : ""}
                    </Text>
                  ))}
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {landing.testimonials?.length ? (
          <>
            <SectionTitle>CLIENT RESULTS</SectionTitle>
            <View style={{ gap: spacing.sm }}>
              {landing.testimonials.map((t, i) => (
                <Card key={i} style={{ gap: 4 }}>
                  <Text style={styles.quote}>“{t.text}”</Text>
                  <Text style={styles.quoteName}>— {t.name}</Text>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {form ? (
          <>
            <SectionTitle>{form.title.toUpperCase()}</SectionTitle>
            {sent ? (
              <Card testID="lead-success">
                <Text style={styles.success}>{sent}</Text>
              </Card>
            ) : (
              <Card style={{ gap: spacing.md }}>
                {form.intro ? <Text style={styles.body}>{form.intro}</Text> : null}
                <Field label="YOUR NAME" value={name} onChangeText={setName} placeholder="Alex" testID="lead-name-input" />
                <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@email.com" keyboardType="email-address" testID="lead-email-input" />
                {form.fields.map((f) => (
                  <Field
                    key={f.key}
                    label={f.label.toUpperCase()}
                    value={answers[f.key] ?? ""}
                    onChangeText={(t) => setAnswers((prev) => ({ ...prev, [f.key]: t }))}
                    multiline
                    testID={`lead-field-${f.key}`}
                  />
                ))}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button testID="lead-submit-btn" title={landing.cta_label || "Apply now"} onPress={submit} loading={busy} />
              </Card>
            )}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl },
  notFound: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceSecondary, textAlign: "center" },
  hero: { height: 400, justifyContent: "flex-end" },
  heroImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.62)" },
  heroContent: { padding: spacing.xl, gap: spacing.sm },
  logo: { width: 110, height: 44, marginBottom: spacing.sm },
  kicker: { fontFamily: fonts.bold, fontSize: 11, color: colors.brand, letterSpacing: 2 },
  headline: { fontFamily: fonts.displayBold, fontSize: 34, color: colors.onSurface, lineHeight: 38 },
  subheadline: { fontFamily: fonts.regular, fontSize: 15, color: colors.onSurfaceTertiary, lineHeight: 22 },
  heroMeta: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 22 },
  highlight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  highlightText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.onSurface },
  secTitle: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.brand },
  lessonLine: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 20 },
  quote: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurfaceTertiary, lineHeight: 21, fontStyle: "italic" },
  quoteName: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.brand },
  success: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.success, lineHeight: 21 },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
});
