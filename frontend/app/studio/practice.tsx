import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import {
  Card,
  Field,
  Loading,
  Pill,
  Row,
  ScreenHeader,
  SectionTitle,
} from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type DomainSummary = { key: string; label: string; offering: string };
type Group = { key: string; label: string; blurb: string; safety?: string; domains: DomainSummary[] };
type Catalog = {
  groups: Group[];
  approaches: { key: string; label: string; contributes: string }[];
  session_models: { key: string; label: string; use: string }[];
  delivery: { key: string; label: string; use: string }[];
  directiveness: { key: string; label: string; note: string }[];
};
type Practice = {
  domains: string[];
  approaches: string[];
  default_model: string | null;
  directiveness: string;
  delivery: string[];
  do_not_do: string[];
};

export default function PracticeScreen() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [open, setOpen] = useState<string | null>("personal");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [rule, setRule] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([api<Catalog>("/catalog"), api<Practice>("/me/practice")]);
      setCatalog(c);
      setPractice(p);
    } catch {
      // not signed in yet or offline — the loader stays until data arrives
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggle = (field: "domains" | "approaches" | "delivery", key: string) => {
    if (!practice) return;
    const list = practice[field];
    setPractice({
      ...practice,
      [field]: list.includes(key) ? list.filter((x) => x !== key) : [...list, key],
    });
  };

  const save = async () => {
    if (!practice) return;
    setSaving(true);
    try {
      const res = await api<Practice>("/me/practice", { method: "PUT", body: practice });
      setPractice(res);
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  };

  if (!catalog || !practice) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Coaching Practice" />
        <Loading />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Coaching Practice"
        subtitle={`${practice.domains.length} modalities selected`}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Card>
          <Text style={styles.note}>
            Pick every modality you coach. Each one comes with its own resource kit: recommended
            approaches, session models, intake questions, check-in questions, scope limits and
            referral routes.
          </Text>
        </Card>

        <SectionTitle>MODALITIES</SectionTitle>
        {catalog.groups.map((g) => {
          const expanded = open === g.key;
          const count = g.domains.filter((d) => practice.domains.includes(d.key)).length;
          return (
            <View key={g.key} style={{ marginBottom: spacing.sm }}>
              <TouchableOpacity
                testID={`group-${g.key}`}
                style={styles.groupHead}
                onPress={() => setOpen(expanded ? null : g.key)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupTitle}>{g.label}</Text>
                  <Text style={styles.groupBlurb}>{g.blurb}</Text>
                </View>
                {count > 0 ? <Pill label={`${count}`} tone="gold" /> : null}
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.onSurfaceSecondary}
                />
              </TouchableOpacity>
              {expanded ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  {g.safety ? <Text style={styles.safety}>{g.safety}</Text> : null}
                  {g.domains.map((d) => {
                    const on = practice.domains.includes(d.key);
                    return (
                      <View key={d.key} style={[styles.domainRow, on && styles.domainRowOn]}>
                        <TouchableOpacity
                          testID={`domain-${d.key}`}
                          style={styles.domainTap}
                          onPress={() => toggle("domains", d.key)}
                        >
                          <Ionicons
                            name={on ? "checkbox" : "square-outline"}
                            size={20}
                            color={on ? colors.brand : colors.onSurfaceSecondary}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.domainLabel}>{d.label}</Text>
                            <Text style={styles.domainOffering} numberOfLines={2}>
                              {d.offering}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID={`kit-${d.key}`}
                          style={styles.kitBtn}
                          onPress={() => router.push(`/studio/modality/${d.key}`)}
                        >
                          <Text style={styles.kitText}>Kit</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}

        <SectionTitle>HOW YOU FACILITATE</SectionTitle>
        <View style={{ gap: spacing.sm }}>
          {catalog.approaches.map((a) => {
            const on = practice.approaches.includes(a.key);
            return (
              <Row
                key={a.key}
                testID={`approach-${a.key}`}
                icon={on ? "checkbox" : "square-outline"}
                title={a.label}
                subtitle={a.contributes}
                onPress={() => toggle("approaches", a.key)}
              />
            );
          })}
        </View>

        <SectionTitle>DEFAULT SESSION MODEL</SectionTitle>
        <View style={styles.chipWrap}>
          {catalog.session_models.map((m) => {
            const on = practice.default_model === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                testID={`model-${m.key}`}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setPractice({ ...practice, default_model: on ? null : m.key })}
              >
                <Text style={[styles.chipText, on && { color: colors.onBrand }]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <SectionTitle>COACHING STYLE</SectionTitle>
        <View style={{ gap: spacing.sm }}>
          {catalog.directiveness.map((d) => {
            const on = practice.directiveness === d.key;
            return (
              <Row
                key={d.key}
                testID={`style-${d.key}`}
                icon={on ? "radio-button-on" : "radio-button-off"}
                title={d.label}
                subtitle={d.note}
                onPress={() => setPractice({ ...practice, directiveness: d.key })}
              />
            );
          })}
        </View>

        <SectionTitle>HOW YOU DELIVER</SectionTitle>
        <View style={styles.chipWrap}>
          {catalog.delivery.map((d) => {
            const on = practice.delivery.includes(d.key);
            return (
              <TouchableOpacity
                key={d.key}
                testID={`delivery-${d.key}`}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => toggle("delivery", d.key)}
              >
                <Text style={[styles.chipText, on && { color: colors.onBrand }]}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <SectionTitle>THINGS YOU NEVER DO</SectionTitle>
        {practice.do_not_do.map((r, i) => (
          <Row
            key={`${r}-${i}`}
            icon="close-circle"
            title={r}
            right={
              <TouchableOpacity
                onPress={() =>
                  setPractice({ ...practice, do_not_do: practice.do_not_do.filter((_, idx) => idx !== i) })
                }
              >
                <Text style={styles.remove}>Remove</Text>
              </TouchableOpacity>
            }
          />
        ))}
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end", marginTop: spacing.sm }}>
          <Field
            label="ADD A BOUNDARY"
            value={rule}
            onChangeText={setRule}
            placeholder="No meal plans, no diagnosis"
            style={{ flex: 1 }}
            testID="rule-input"
          />
          <Button
            testID="add-rule-btn"
            title="Add"
            variant="secondary"
            onPress={() => {
              if (!rule.trim()) return;
              setPractice({ ...practice, do_not_do: [...practice.do_not_do, rule.trim()] });
              setRule("");
            }}
          />
        </View>

        {savedAt ? <Text style={styles.saved}>Saved at {savedAt}</Text> : null}
        <Button
          testID="save-practice-btn"
          title="Save practice profile"
          onPress={save}
          loading={saving}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  note: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 19 },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
  },
  groupTitle: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.onSurface },
  groupBlurb: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  safety: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.warning,
    lineHeight: 17,
    paddingHorizontal: spacing.sm,
  },
  domainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  domainRowOn: { borderColor: colors.brandSecondary, backgroundColor: "#12110D" },
  domainTap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
  domainLabel: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.onSurface },
  domainOffering: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.onSurfaceSecondary, marginTop: 2, lineHeight: 16 },
  kitBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  kitText: { fontFamily: fonts.bold, fontSize: 11, color: colors.brand, letterSpacing: 0.6 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurface },
  remove: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.error },
  saved: { fontFamily: fonts.medium, fontSize: 12, color: colors.success, marginTop: spacing.md },
});
