/** Shared building blocks for the Studio (coach) and Portal (client) modules.
 *  Luxe Dark: obsidian surfaces, champagne-gold accents, hairline borders. */
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius, spacing } from "../../theme";

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
      <TouchableOpacity
        testID="back-btn"
        style={s.iconBtn}
        onPress={onBack ?? (() => router.back())}
      >
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={s.rightSlot}>{right}</View>
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  testID?: string;
}) {
  if (onPress) {
    return (
      <TouchableOpacity testID={testID} activeOpacity={0.85} onPress={onPress} style={[s.card, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Pill({
  label,
  tone = "neutral",
  style,
}: {
  label: string;
  tone?: "neutral" | "gold" | "good" | "warn" | "bad";
  style?: ViewStyle;
}) {
  const map: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
    gold: { bg: colors.brandTertiary, fg: colors.onBrandTertiary },
    good: { bg: "rgba(34,197,94,0.14)", fg: colors.success },
    warn: { bg: "rgba(245,158,11,0.14)", fg: colors.warning },
    bad: { bg: "rgba(239,68,68,0.14)", fg: colors.error },
  };
  const c = map[tone];
  return (
    <View style={[s.pill, { backgroundColor: c.bg }, style]}>
      <Text style={[s.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function StatTile({
  value,
  label,
  testID,
}: {
  value: string | number;
  label: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  onPress,
  right,
  testID,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      style={s.row}
    >
      {icon ? (
        <View style={s.rowIcon}>
          <Ionicons name={icon} size={18} color={colors.brand} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle ? <Text style={s.rowSub}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} /> : null)}
    </TouchableOpacity>
  );
}

export function EmptyState({
  icon = "sparkles-outline",
  title,
  body,
  testID,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={s.empty}>
      <Ionicons name={icon} size={42} color={colors.onSurfaceSecondary} />
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={s.loading}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  testID,
  style,
}: {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "email-address";
  testID?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput
        testID={testID}
        style={[s.input, multiline && { minHeight: 96, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceSecondary}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
      />
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.overlay}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>{title.toUpperCase()}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
            <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>{children}</View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ProgressBar({ pct, style }: { pct: number; style?: ViewStyle }) {
  return (
    <View style={[s.track, style]}>
      <View style={[s.fill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
    </View>
  );
}

export const text: Record<string, TextStyle> = {
  body: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurfaceSecondary, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.onSurfaceSecondary, letterSpacing: 0.4 },
};

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  rightSlot: { minWidth: 44, alignItems: "flex-end" },
  headerTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, letterSpacing: 0.4 },
  headerSub: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.onSurfaceSecondary, marginTop: 1 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 12.5,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.4,
  },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, alignSelf: "flex-start" },
  pillText: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.7 },
  stat: {
    flex: 1,
    minWidth: 96,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  statValue: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.brand },
  statLabel: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.onSurfaceSecondary, letterSpacing: 0.6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 60,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontFamily: fonts.semiBold, fontSize: 14.5, color: colors.onSurface },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xxl },
  emptyTitle: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.onSurface, textAlign: "center" },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  fieldLabel: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.onSurfaceSecondary, letterSpacing: 0.8 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 16,
    color: colors.onSurface,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
});
