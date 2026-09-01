import React from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Card, Loading, ScreenHeader } from "@/src/components/studio/UI";
import { useModules } from "@/src/lib/modules";
import { colors, fonts, spacing } from "@/src/theme";

export default function ModulesScreen() {
  const { modules, editable, loading, toggle } = useModules();

  return (
    <View style={styles.container}>
      <ScreenHeader title="Platform Modules" subtitle="Turn features on only when you need them" />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}>
          <Card>
            <Text style={styles.note}>
              Everything below is additive. Your programs, clients, chat and settings keep working exactly
              as before whether a module is on or off.
            </Text>
          </Card>
          {modules.map((m) => (
            <Card key={m.key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{m.label}</Text>
                <Text style={styles.sub}>{m.description}</Text>
              </View>
              <Switch
                testID={`toggle-${m.key}`}
                value={m.enabled}
                disabled={!editable}
                onValueChange={(v) => toggle(m.key, v)}
                trackColor={{ false: colors.surfaceTertiary, true: colors.brandSecondary }}
                thumbColor={m.enabled ? colors.brand : colors.onSurfaceSecondary}
              />
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  title: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, marginTop: 3, lineHeight: 18 },
  note: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, lineHeight: 19 },
});
