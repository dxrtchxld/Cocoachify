import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type ClientDetail = {
  user_id: string;
  name: string;
  email: string;
  status: string;
  program_name: string | null;
  program_id: string | null;
  current_day: number | null;
  total_days: number | null;
  last_checkin: string | null;
  onboarding: {
    goal: string;
    experience: string;
    days_per_week: number;
    focus: string | null;
    notes: string | null;
  } | null;
  logs: {
    id: string;
    log_type: string;
    session_name: string | null;
    duration_minutes: number | null;
    rpe: number | null;
    weight: number | null;
    notes: string | null;
    date: string;
  }[];
};

type Program = { id: string; name: string; category: string; total_days: number; difficulty: string };

const LABELS: Record<string, string> = {
  lose_weight: "🔥 Lose Weight",
  build_strength: "💪 Build Strength",
  cardio: "🏃 Cardio / Endurance",
  flexibility: "🧘 Flexibility / Mobility",
  wellness: "⚖️ General Wellness",
  just_starting: "🌱 Just Starting",
  some_experience: "🔁 Some Experience",
  experienced: "⚡ Experienced",
  upper_body: "Upper Body",
  lower_body: "Lower Body",
  core_back: "Core & Back",
  full_body: "Full Body",
  cardio_focus: "Cardio Focus",
  mind_body: "Mind & Body",
};

export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setClient(await api<ClientDetail>(`/coach/clients/${id}`));
    } catch {
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openAssign = async () => {
    setAssignOpen(true);
    try {
      setPrograms(await api<Program[]>("/programs"));
    } catch {
      setPrograms([]);
    }
  };

  const assign = async (programId: string) => {
    setAssigning(programId);
    try {
      await api("/coach/assign", { method: "POST", body: { client_id: id, program_id: programId } });
      setAssignOpen(false);
      await load();
    } catch {
      // keep modal open
    } finally {
      setAssigning(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  if (!client) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.onSurfaceSecondary, fontFamily: fonts.medium }}>Client not found.</Text>
      </View>
    );
  }

  const ob = client.onboarding;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 120 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(client.name || "C")[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{client.name}</Text>
            <Text style={styles.email}>{client.email}</Text>
          </View>
          <TouchableOpacity
            testID="message-client-btn"
            style={styles.msgBtn}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: client.user_id } })}
          >
            <Ionicons name="chatbubble-ellipses" size={20} color={colors.brand} />
          </TouchableOpacity>
        </View>

        {/* Current program */}
        <Text style={styles.sectionTitle}>CURRENT PROGRAM</Text>
        {client.program_name ? (
          <TouchableOpacity
            style={styles.programCard}
            activeOpacity={0.8}
            onPress={() =>
              client.program_id &&
              router.push({ pathname: "/program/[id]", params: { id: client.program_id } })
            }
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.programName}>{client.program_name}</Text>
              <Text style={styles.programMeta}>
                Day {client.current_day} of {client.total_days}
                {client.last_checkin ? ` · last check-in ${formatDate(client.last_checkin)}` : " · no check-ins yet"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active program. Assign one below.</Text>
          </View>
        )}

        {/* Onboarding intake */}
        <Text style={styles.sectionTitle}>CLIENT INTAKE</Text>
        {ob ? (
          <View style={styles.intakeCard}>
            <View style={styles.intakeRow}>
              <Text style={styles.intakeLabel}>Goal</Text>
              <Text style={styles.intakeValue}>{LABELS[ob.goal] ?? ob.goal}</Text>
            </View>
            <View style={styles.intakeRow}>
              <Text style={styles.intakeLabel}>Experience</Text>
              <Text style={styles.intakeValue}>{LABELS[ob.experience] ?? ob.experience}</Text>
            </View>
            <View style={styles.intakeRow}>
              <Text style={styles.intakeLabel}>Days/week</Text>
              <Text style={styles.intakeValue}>{ob.days_per_week}</Text>
            </View>
            {ob.focus ? (
              <View style={styles.intakeRow}>
                <Text style={styles.intakeLabel}>Focus</Text>
                <Text style={styles.intakeValue}>{LABELS[ob.focus] ?? ob.focus}</Text>
              </View>
            ) : null}
            {ob.notes ? (
              <View style={[styles.intakeRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.intakeLabel}>Notes</Text>
                <Text style={[styles.intakeValue, { flex: 1, textAlign: "right" }]}>{ob.notes}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Client hasn&apos;t completed onboarding yet.</Text>
          </View>
        )}

        {/* Check-in history */}
        <Text style={styles.sectionTitle}>CHECK-IN HISTORY</Text>
        {client.logs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No check-ins yet.</Text>
          </View>
        ) : (
          client.logs.map((l) => (
            <View key={l.id} style={styles.logRow}>
              <Ionicons
                name={l.log_type === "body" ? "scale" : "checkmark-circle"}
                size={18}
                color={colors.success}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.logName}>
                  {l.log_type === "body" ? `${l.weight} kg` : l.session_name ?? "Workout"}
                </Text>
                <Text style={styles.logMeta}>
                  {formatDate(l.date)}
                  {l.duration_minutes ? ` · ${l.duration_minutes} min` : ""}
                  {l.rpe ? ` · RPE ${l.rpe}` : ""}
                </Text>
                {l.notes ? <Text style={styles.logNotes}>&ldquo;{l.notes}&rdquo;</Text> : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          testID="assign-program-btn"
          title={client.program_name ? "Assign a Different Program" : "Assign a Program"}
          onPress={openAssign}
        />
      </View>

      {/* Assign modal */}
      <Modal visible={assignOpen} transparent animationType="slide" onRequestClose={() => setAssignOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setAssignOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>ASSIGN A PROGRAM</Text>
            {programs.length === 0 ? (
              <View style={{ paddingVertical: spacing.xl, alignItems: "center", gap: spacing.md }}>
                <Text style={styles.emptyText}>You haven&apos;t created any programs yet.</Text>
                <Button
                  title="Create a Program"
                  variant="secondary"
                  onPress={() => {
                    setAssignOpen(false);
                    router.push("/program-editor");
                  }}
                />
              </View>
            ) : (
              <FlatList
                data={programs}
                keyExtractor={(p) => p.id}
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    testID={`assign-${item.id}`}
                    style={styles.pickRow}
                    onPress={() => assign(item.id)}
                    disabled={assigning !== null}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logName}>{item.name}</Text>
                      <Text style={styles.logMeta}>
                        {item.category} · {item.total_days} days · {item.difficulty}
                      </Text>
                    </View>
                    {assigning === item.id ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <Ionicons name="arrow-forward-circle" size={24} color={colors.brand} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  headerRow: { paddingHorizontal: spacing.lg },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onBrandTertiary },
  name: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface },
  email: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 1 },
  msgBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 13,
    color: colors.brand,
    letterSpacing: 1.2,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  programCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    minHeight: 68,
  },
  programName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  programMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  emptyCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  emptyText: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary },
  intakeCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  intakeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 48,
  },
  intakeLabel: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  intakeValue: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.onSurface },
  logRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  logName: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurface },
  logMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  logNotes: { fontFamily: fonts.regular, fontSize: 12, fontStyle: "italic", color: colors.onSurfaceTertiary, marginTop: 3 },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceTertiary,
    minHeight: 60,
  },
});
