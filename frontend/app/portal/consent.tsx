import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Card, Loading, ScreenHeader } from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

export default function PortalConsent() {
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ granted: boolean }>("/studio/assistant/my-consent");
      setGranted(res.granted);
    } catch (e: any) {
      setError(e?.message ?? "Unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (value: boolean) => {
    setGranted(value);
    try {
      await api("/studio/assistant/my-consent", { method: "PUT", body: { granted: value } });
    } catch {
      load();
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Assistant Consent" subtitle="You're in control" />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Card style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Allow AI drafting on my data</Text>
              <Text style={styles.hint}>
                When on, your coach can generate private drafts (session agendas, check-in summaries,
                follow-up ideas) from your check-ins and goals.
              </Text>
            </View>
            <Switch
              testID="consent-toggle"
              value={granted}
              onValueChange={toggle}
              trackColor={{ false: colors.surfaceTertiary, true: colors.brandSecondary }}
              thumbColor={granted ? colors.brand : colors.onSurfaceSecondary}
            />
          </Card>
          <Card>
            <Text style={styles.hint}>
              • Drafts are only ever shown to your coach — the assistant never messages you.{"\n"}
              • Nothing is generated while this is off.{"\n"}
              • You can switch this off at any time.
            </Text>
          </Card>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  title: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.onSurface, marginBottom: 4 },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 19 },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
});
