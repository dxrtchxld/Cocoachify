import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

const GOALS = [
  { id: "lose_weight", icon: "flame", title: "Lose Weight", sub: "Burn fat, feel lighter, build sustainable habits" },
  { id: "build_strength", icon: "barbell", title: "Build Strength", sub: "Get stronger, increase muscle, improve performance" },
  { id: "cardio", icon: "walk", title: "Cardio / Endurance", sub: "Running, cycling, rowing — build your aerobic engine" },
  { id: "flexibility", icon: "body", title: "Flexibility / Mobility", sub: "Move better, reduce pain, improve range of motion" },
  { id: "wellness", icon: "pulse", title: "General Wellness", sub: "Balance, energy, stress, and feeling good overall" },
];

const LEVELS = [
  { id: "just_starting", icon: "leaf", title: "Just Starting", sub: "New to structured training or returning after a break" },
  { id: "some_experience", icon: "refresh", title: "Some Experience", sub: "Consistent for 6+ months, familiar with the basics" },
  { id: "experienced", icon: "flash", title: "Experienced", sub: "Training hard for years, ready for serious programming" },
];

const FOCUS = [
  { id: "upper_body", icon: "barbell", label: "Upper Body" },
  { id: "lower_body", icon: "walk", label: "Lower Body" },
  { id: "core_back", icon: "fitness", label: "Core & Back" },
  { id: "full_body", icon: "flash", label: "Full Body" },
  { id: "cardio_focus", icon: "heart", label: "Cardio Focus" },
  { id: "mind_body", icon: "body", label: "Mind & Body" },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<string | null>(null);
  const [experience, setExperience] = useState<string | null>(null);
  const [days, setDays] = useState(3);
  const [focus, setFocus] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const canContinue =
    step === 0 || (step === 1 && !!goal) || (step === 2 && !!experience) || step === 3;

  const next = async () => {
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      await api("/me/onboarding", {
        method: "PUT",
        body: { goal, experience, days_per_week: days, focus, notes: notes.trim() || null },
      });
      await refreshUser();
      router.replace("/(tabs)");
    } catch {
      setBusy(false);
    }
  };

  const daysHint =
    days <= 2 ? "Light — great for busy weeks" : days <= 4 ? "Balanced — most recommended" : "Ambitious — recovery matters";

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.header}>ONBOARDING WITH YOUR COACH</Text>
      <View style={styles.progressRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.progressSeg, i <= step && styles.progressSegActive]} />
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View style={styles.stepBody}>
              <Ionicons name="hand-left" size={40} color={colors.brand} style={styles.emoji} />
              <Text style={styles.title}>Welcome, {user?.name?.split(" ")[0] || "there"}.</Text>
              <Text style={styles.italic}>Built for your journey.</Text>
              <Text style={styles.body}>
                Before your first session, we&apos;ll take 60 seconds to understand your goals — so
                your first day feels built for you, not copied from a template.
              </Text>
              <View style={styles.bullets}>
                <Text style={styles.bullet}>•  Personalized to your goal</Text>
                <Text style={styles.bullet}>•  Tailored intensity</Text>
                <Text style={styles.bullet}>•  Coach gets your full context on Day 1</Text>
              </View>
            </View>
          )}

          {step === 1 && (
            <View style={styles.stepBody}>
              <Text style={styles.title}>What&apos;s your main goal?</Text>
              <Text style={styles.body}>Pick the one that matters most right now.</Text>
              {GOALS.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  testID={`goal-${g.id}`}
                  style={[styles.option, goal === g.id && styles.optionActive]}
                  activeOpacity={0.85}
                  onPress={() => setGoal(g.id)}
                >
                  <Ionicons name={g.icon as any} size={22} color={colors.brand} style={styles.optionEmoji} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{g.title}</Text>
                    <Text style={styles.optionSub}>{g.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepBody}>
              <Text style={styles.title}>What&apos;s your experience level?</Text>
              <Text style={styles.body}>Be honest — this sets your starting intensity.</Text>
              {LEVELS.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  testID={`level-${l.id}`}
                  style={[styles.option, experience === l.id && styles.optionActive]}
                  activeOpacity={0.85}
                  onPress={() => setExperience(l.id)}
                >
                  <Ionicons name={l.icon as any} size={22} color={colors.brand} style={styles.optionEmoji} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{l.title}</Text>
                    <Text style={styles.optionSub}>{l.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepBody}>
              <Text style={styles.title}>How does your schedule look?</Text>
              <Text style={styles.body}>We&apos;ll build around your life, not against it.</Text>

              <Text style={styles.fieldLabel}>Days per week</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  testID="days-minus"
                  style={styles.stepperBtn}
                  onPress={() => setDays(Math.max(1, days - 1))}
                >
                  <Ionicons name="remove" size={22} color={colors.onSurface} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{days}</Text>
                <TouchableOpacity
                  testID="days-plus"
                  style={styles.stepperBtn}
                  onPress={() => setDays(Math.min(7, days + 1))}
                >
                  <Ionicons name="add" size={22} color={colors.onSurface} />
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>{daysHint}</Text>

              <Text style={styles.fieldLabel}>Primary focus area (optional)</Text>
              <View style={styles.chipWrap}>
                {FOCUS.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    testID={`focus-${f.id}`}
                    style={[styles.chip, focus === f.id && styles.chipActive]}
                    onPress={() => setFocus(focus === f.id ? null : f.id)}
                  >
                    <Ionicons
                      name={f.icon as any}
                      size={14}
                      color={focus === f.id ? colors.onSurface : colors.onSurfaceSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.chipText, focus === f.id && styles.chipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Anything your coach should know? (optional)</Text>
              <TextInput
                testID="onboarding-notes"
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Injuries, work schedule, travel, etc..."
                placeholderTextColor={colors.onSurfaceSecondary}
                multiline
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        {step > 0 ? (
          <TouchableOpacity testID="onboarding-back" style={styles.backBtn} onPress={() => setStep(step - 1)}>
            <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
        <Button
          testID="onboarding-continue"
          title={step === 3 ? "Complete" : "Continue"}
          onPress={next}
          loading={busy}
          disabled={!canContinue}
          style={{ flex: 1, marginLeft: spacing.lg }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
    letterSpacing: 1.5,
    textAlign: "center",
  },
  progressRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.md },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surfaceTertiary },
  progressSegActive: { backgroundColor: colors.brand },
  stepBody: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  emoji: { fontSize: 44 },
  title: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.onSurface, marginTop: spacing.md },
  italic: { fontFamily: fonts.medium, fontSize: 15, fontStyle: "italic", color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  body: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 22, color: colors.onSurfaceTertiary, marginTop: spacing.md },
  bullets: { marginTop: spacing.xxl, gap: spacing.md },
  bullet: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.onSurface },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    minHeight: 72,
  },
  optionActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  optionEmoji: { fontSize: 24 },
  optionTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  optionSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2, lineHeight: 17 },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xl },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: { fontFamily: fonts.displayBold, fontSize: 40, color: colors.brand, minWidth: 60, textAlign: "center" },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  chipText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onSurface },
  notesInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 14,
    backgroundColor: colors.surfaceSecondary,
    textAlignVertical: "top",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
});
