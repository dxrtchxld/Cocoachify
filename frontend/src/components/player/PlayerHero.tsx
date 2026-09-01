import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Scrim from "../Scrim";
import { colors, coverFor, fonts, radius, sessionTypeIcon, spacing } from "../../theme";

export default function PlayerHero({
  title,
  sessionType,
  minutes,
  exerciseCount,
  blockCount,
  category,
  cover,
}: {
  title: string;
  sessionType: string;
  minutes: number;
  exerciseCount: number;
  blockCount: number;
  category?: string | null;
  cover?: string | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.hero}>
      <Image source={{ uri: coverFor(category ?? sessionType, cover) }} style={s.image} resizeMode="cover" />
      <Scrim />
      <View style={[s.top, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity testID="back-btn" style={s.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={s.badge}>
          <Ionicons name={(sessionTypeIcon[sessionType] as any) || "barbell"} size={13} color={colors.brand} />
          <Text style={s.badgeText}>{(sessionType || "workout").toUpperCase()}</Text>
        </View>
      </View>
      <View style={s.bottom}>
        <Text style={s.title}>{title}</Text>
        <View style={s.metaRow}>
          {minutes > 0 ? <Meta icon="time-outline" label={`${minutes} min`} /> : null}
          <Meta icon="barbell-outline" label={`${exerciseCount} moves`} />
          {blockCount > 1 ? <Meta icon="layers-outline" label={`${blockCount} blocks`} /> : null}
        </View>
      </View>
    </View>
  );
}

function Meta({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={s.meta}>
      <Ionicons name={icon} size={13} color={colors.brand} />
      <Text style={s.metaText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { height: 320, justifyContent: "space-between" },
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginRight: spacing.sm,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.onSurfaceTertiary, letterSpacing: 1.2 },
  bottom: { padding: spacing.xl, gap: spacing.md },
  title: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 36, color: colors.onSurface },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  metaText: { fontFamily: fonts.semiBold, fontSize: 11.5, color: colors.onSurfaceTertiary, letterSpacing: 0.4 },
});
