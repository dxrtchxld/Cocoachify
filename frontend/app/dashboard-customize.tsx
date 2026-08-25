import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Section = { key: string; visible: boolean };

const META: Record<string, { label: string; sub: string; icon: any }> = {
  stats: { label: "Stats Overview", sub: "Clients, programs, active %", icon: "stats-chart" },
  quick_actions: { label: "Quick Actions", sub: "Invite, new program, library", icon: "flash" },
  needs_attention: { label: "Needs Attention", sub: "Clients falling behind", icon: "alert-circle" },
  inbox_preview: { label: "New Check-ins", sub: "Latest unreviewed check-ins", icon: "mail-unread" },
  recent_activity: { label: "Recent Activity", sub: "Client workout history", icon: "pulse" },
};

export default function DashboardCustomize() {
  const insets = useSafeAreaInsets();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ sections: Section[] }>("/me/dashboard-layout");
        setSections(res.sections);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= sections.length) return;
    const copy = [...sections];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    setSections(copy);
  };

  const toggle = (index: number) => {
    const copy = [...sections];
    copy[index] = { ...copy[index], visible: !copy[index].visible };
    setSections(copy);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api("/me/dashboard-layout", { method: "PUT", body: { sections } });
      router.back();
    } catch {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Customize Home</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={styles.hint}>
        Reorder with the arrows and hide anything you don&apos;t use. Your layout is saved to your account.
      </Text>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.md }}>
        {sections.map((s, i) => {
          const m = META[s.key] ?? { label: s.key, sub: "", icon: "square" };
          return (
            <View key={s.key} testID={`section-${s.key}`} style={styles.card}>
              <View style={styles.arrows}>
                <TouchableOpacity
                  testID={`up-${s.key}`}
                  onPress={() => move(i, -1)}
                  disabled={i === 0}
                  style={styles.arrowBtn}
                >
                  <Ionicons name="chevron-up" size={20} color={i === 0 ? colors.border : colors.onSurface} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`down-${s.key}`}
                  onPress={() => move(i, 1)}
                  disabled={i === sections.length - 1}
                  style={styles.arrowBtn}
                >
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color={i === sections.length - 1 ? colors.border : colors.onSurface}
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.iconWrap}>
                <Ionicons name={m.icon} size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{m.label}</Text>
                <Text style={styles.sub}>{m.sub}</Text>
              </View>
              <Switch
                testID={`toggle-${s.key}`}
                value={s.visible}
                onValueChange={() => toggle(i)}
                trackColor={{ false: colors.surfaceTertiary, true: colors.brand }}
                thumbColor="#FFFFFF"
              />
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button testID="save-layout-btn" title="Save Layout" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, paddingHorizontal: spacing.xl, marginTop: spacing.sm, lineHeight: 19 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    minHeight: 68,
  },
  arrows: { justifyContent: "center" },
  arrowBtn: { width: 32, height: 26, alignItems: "center", justifyContent: "center" },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  sticky: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
