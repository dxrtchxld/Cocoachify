import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import Button from "@/src/components/Button";
import { Card, Loading, Pill, ScreenHeader, SectionTitle } from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type Kit = {
  key: string;
  label: string;
  group_label: string;
  group_safety?: string | null;
  offering: string;
  must_have: string;
  inputs: string[];
  outputs: string[];
  exclusions: string[];
  escalation: string[];
  intake: string[];
  checkin: string[];
  approach_details: { key: string; label: string; contributes: string; config: string }[];
  model_details: { key: string; label: string; use: string; fields: string[]; output: string }[];
  installed: boolean;
};

export default function ModalityKit() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const [kit, setKit] = useState<Kit | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: string[]; skipped: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      setKit(await api<Kit>(`/catalog/domains/${key}`));
    } catch {
      setKit(null);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  const install = async () => {
    setBusy(true);
    try {
      setResult(await api(`/catalog/domains/${key}/install`, { method: "POST" }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!kit) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Modality" />
        <Loading />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={kit.label} subtitle={kit.group_label} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Card style={{ gap: spacing.sm }}>
          {kit.installed ? <Pill label="RESOURCES INSTALLED" tone="good" /> : null}
          <Text style={styles.h}>What to offer</Text>
          <Text style={styles.b}>{kit.offering}</Text>
          <Text style={styles.h}>The one capability that makes it work</Text>
          <Text style={styles.b}>{kit.must_have}</Text>
        </Card>

        {kit.group_safety ? (
          <Card style={{ marginTop: spacing.md, borderColor: colors.warning }}>
            <Text style={styles.warnLabel}>SCOPE NOTE</Text>
            <Text style={styles.b}>{kit.group_safety}</Text>
          </Card>
        ) : null}

        <SectionTitle>WHAT YOU COLLECT</SectionTitle>
        <Card>
          {kit.inputs.map((i) => (
            <Text key={i} style={styles.li}>
              • {i}
            </Text>
          ))}
        </Card>

        <SectionTitle>WHAT THE CLIENT GETS</SectionTitle>
        <Card>
          {kit.outputs.map((o) => (
            <Text key={o} style={styles.li}>
              • {o}
            </Text>
          ))}
        </Card>

        <SectionTitle>RECOMMENDED APPROACHES</SectionTitle>
        <View style={{ gap: spacing.sm }}>
          {kit.approach_details.map((a) => (
            <Card key={a.key} style={{ gap: 4 }}>
              <Text style={styles.h}>{a.label}</Text>
              <Text style={styles.b}>{a.contributes}</Text>
              <Text style={styles.meta}>{a.config}</Text>
            </Card>
          ))}
        </View>

        <SectionTitle>SESSION MODELS</SectionTitle>
        <View style={{ gap: spacing.sm }}>
          {kit.model_details.map((m) => (
            <Card key={m.key} style={{ gap: 4 }}>
              <Text style={styles.h}>{m.label}</Text>
              <Text style={styles.b}>{m.use}</Text>
              <Text style={styles.meta}>Steps: {m.fields.join(" → ")}</Text>
              <Text style={styles.meta}>Produces: {m.output}</Text>
            </Card>
          ))}
        </View>

        <SectionTitle>INTAKE QUESTIONS</SectionTitle>
        <Card>
          {kit.intake.map((q) => (
            <Text key={q} style={styles.li}>
              • {q}
            </Text>
          ))}
        </Card>

        <SectionTitle>CHECK-IN QUESTIONS</SectionTitle>
        <Card>
          {kit.checkin.map((q) => (
            <Text key={q} style={styles.li}>
              • {q}
            </Text>
          ))}
        </Card>

        <SectionTitle>OUT OF SCOPE</SectionTitle>
        <Card>
          {kit.exclusions.map((e) => (
            <Text key={e} style={styles.liWarn}>
              • {e}
            </Text>
          ))}
        </Card>

        <SectionTitle>REFER OUT TO</SectionTitle>
        <Card>
          {kit.escalation.map((e) => (
            <Text key={e} style={styles.li}>
              • {e}
            </Text>
          ))}
        </Card>

        {result ? (
          <Card style={{ marginTop: spacing.md, gap: 4 }}>
            {result.created.map((c) => (
              <Text key={c} style={styles.ok}>
                Created: {c}
              </Text>
            ))}
            {result.skipped.map((s) => (
              <Text key={s} style={styles.meta}>
                {s}
              </Text>
            ))}
          </Card>
        ) : null}

        <Button
          testID="install-kit-btn"
          title={kit.installed ? "Re-install resources" : "Install intake + check-in forms"}
          onPress={install}
          loading={busy}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  h: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.brand, letterSpacing: 0.3 },
  b: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurface, lineHeight: 20 },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, lineHeight: 18 },
  li: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 21 },
  liWarn: { fontFamily: fonts.medium, fontSize: 13, color: colors.warning, lineHeight: 21 },
  warnLabel: { fontFamily: fonts.bold, fontSize: 10, color: colors.warning, letterSpacing: 1, marginBottom: 4 },
  ok: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.success },
});
