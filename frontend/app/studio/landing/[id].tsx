import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import { Card, Field, Loading, Row, ScreenHeader, SectionTitle } from "@/src/components/studio/UI";
import { BACKEND_URL, api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type Landing = {
  headline: string;
  subheadline: string;
  hero_image: string | null;
  highlights: string[];
  testimonials: { name: string; text: string }[];
  cta_label: string;
  lead_form_id: string | null;
  published: boolean;
};

type LeadForm = { id: string; title: string; submissions: number };

export default function LandingEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [copied, setCopied] = useState(false);
  const [l, setL] = useState<Landing>({
    headline: "",
    subheadline: "",
    hero_image: null,
    highlights: [],
    testimonials: [],
    cta_label: "Apply now",
    lead_form_id: null,
    published: false,
  });
  const [highlight, setHighlight] = useState("");
  const [tName, setTName] = useState("");
  const [tText, setTText] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ landing: Landing; slug: string }>(`/studio/courses/${id}/landing`);
      setL({ ...res.landing, highlights: res.landing.highlights ?? [], testimonials: res.landing.testimonials ?? [] });
      setSlug(res.slug);
      setForms(await api<LeadForm[]>("/studio/lead-forms").catch(() => []));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api(`/studio/courses/${id}/landing`, { method: "PUT", body: l });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = slug ? `${BACKEND_URL}/p/${slug}` : "";

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Landing page" />
        <Loading />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Landing page" subtitle="Public, shareable, no login needed" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <Card style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Published</Text>
            <Text style={styles.hint}>When on, anyone with the link can view this page.</Text>
          </View>
          <Switch
            testID="landing-published-toggle"
            value={l.published}
            onValueChange={(v) => setL({ ...l, published: v })}
            trackColor={{ false: colors.surfaceTertiary, true: colors.brandSecondary }}
            thumbColor={l.published ? colors.brand : colors.onSurfaceSecondary}
          />
        </Card>

        {slug ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.linkLabel}>PUBLIC LINK</Text>
            <Text style={styles.link} numberOfLines={2}>
              {publicUrl}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                testID="copy-link-btn"
                title={copied ? "Copied" : "Copy link"}
                variant="secondary"
                style={{ flex: 1 }}
                onPress={async () => {
                  await Clipboard.setStringAsync(publicUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              />
              <Button
                testID="preview-btn"
                title="Preview"
                style={{ flex: 1 }}
                onPress={() => router.push(`/p/${slug}`)}
              />
            </View>
          </Card>
        ) : null}

        <Field label="HEADLINE" value={l.headline} onChangeText={(t) => setL({ ...l, headline: t })} placeholder="Get strong in 8 weeks" testID="headline-input" />
        <Field label="SUBHEADLINE" value={l.subheadline} onChangeText={(t) => setL({ ...l, subheadline: t })} placeholder="Coached, personal, no guesswork" multiline testID="subheadline-input" />
        <Field label="BUTTON LABEL" value={l.cta_label} onChangeText={(t) => setL({ ...l, cta_label: t })} placeholder="Apply now" testID="cta-input" />

        <SectionTitle>HIGHLIGHTS</SectionTitle>
        {l.highlights.map((h, i) => (
          <Row
            key={`${h}-${i}`}
            icon="checkmark-circle"
            title={h}
            right={
              <TouchableOpacity
                onPress={() => setL({ ...l, highlights: l.highlights.filter((_, idx) => idx !== i) })}
              >
                <Text style={styles.remove}>Remove</Text>
              </TouchableOpacity>
            }
          />
        ))}
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" }}>
          <Field
            label="ADD A HIGHLIGHT"
            value={highlight}
            onChangeText={setHighlight}
            placeholder="Weekly 1:1 calls"
            style={{ flex: 1 }}
            testID="highlight-input"
          />
          <Button
            testID="add-highlight-btn"
            title="Add"
            variant="secondary"
            onPress={() => {
              if (!highlight.trim()) return;
              setL({ ...l, highlights: [...l.highlights, highlight.trim()] });
              setHighlight("");
            }}
          />
        </View>

        <SectionTitle>TESTIMONIALS</SectionTitle>
        {l.testimonials.map((t, i) => (
          <Card key={`${t.name}-${i}`} style={{ gap: 4 }}>
            <Text style={styles.title}>{t.name}</Text>
            <Text style={styles.hint}>“{t.text}”</Text>
            <TouchableOpacity
              onPress={() => setL({ ...l, testimonials: l.testimonials.filter((_, idx) => idx !== i) })}
            >
              <Text style={styles.remove}>Remove</Text>
            </TouchableOpacity>
          </Card>
        ))}
        <Field label="CLIENT NAME" value={tName} onChangeText={setTName} placeholder="Sarah M." testID="testimonial-name-input" />
        <Field label="WHAT THEY SAID" value={tText} onChangeText={setTText} placeholder="I finally stayed consistent." multiline testID="testimonial-text-input" />
        <Button
          testID="add-testimonial-btn"
          title="Add testimonial"
          variant="secondary"
          onPress={() => {
            if (!tName.trim() || !tText.trim()) return;
            setL({ ...l, testimonials: [...l.testimonials, { name: tName.trim(), text: tText.trim() }] });
            setTName("");
            setTText("");
          }}
        />

        <SectionTitle>LEAD FORM</SectionTitle>
        {forms.length === 0 ? (
          <Card>
            <Text style={styles.hint}>
              No lead forms yet. Create one in Studio → Contacts & Leads, then attach it here to capture
              applications straight from this page.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {forms.map((f) => (
              <TouchableOpacity
                key={f.id}
                testID={`pick-form-${f.id}`}
                onPress={() => setL({ ...l, lead_form_id: l.lead_form_id === f.id ? null : f.id })}
                style={[styles.pickRow, l.lead_form_id === f.id && styles.pickRowActive]}
              >
                <Text style={[styles.title, l.lead_form_id === f.id && { color: colors.brand }]}>{f.title}</Text>
                <Text style={styles.hint}>{f.submissions} submissions</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button testID="save-landing-btn" title="Save landing page" onPress={save} loading={saving} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  title: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 18 },
  linkLabel: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.onSurfaceSecondary, letterSpacing: 1 },
  link: { fontFamily: fonts.medium, fontSize: 13, color: colors.brand },
  remove: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.error },
  pickRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    gap: 2,
  },
  pickRowActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
});
