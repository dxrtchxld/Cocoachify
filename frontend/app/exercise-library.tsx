import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Exercise = {
  id: string | null;
  name: string;
  note: string;
  sets: number | null;
  reps: string | null;
  usage_count: number;
  source: "program" | "manual";
};

export default function ExerciseLibrary() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api<Exercise[]>("/coach/exercise-library"));
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api("/coach/exercise-library", { method: "POST", body: { name: name.trim(), note: note.trim() } });
      setName("");
      setNote("");
      setAddOpen(false);
      await load();
    } catch {
      // keep modal
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((e) => e.id !== id));
    try {
      await api(`/coach/exercise-library/${id}`, { method: "DELETE" });
    } catch {
      load();
    }
  };

  const filtered = items.filter(
    (e) => !query.trim() || e.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Exercise Library</Text>
        <TouchableOpacity testID="add-exercise-btn" onPress={() => setAddOpen(true)} style={styles.backBtn}>
          <Ionicons name="add" size={26} color={colors.brand} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
        <TextInput
          testID="exercise-search"
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises..."
          placeholderTextColor={colors.onSurfaceSecondary}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="barbell-outline" size={44} color={colors.onSurfaceSecondary} />
          <Text style={styles.emptyText}>
            {items.length === 0 ? "No exercises yet. Add one or build a program." : "No matches."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e, i) => `${e.name}-${i}`}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.md, gap: spacing.sm }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.source === "manual" && (
                    <View style={styles.manualChip}>
                      <Text style={styles.manualText}>SAVED</Text>
                    </View>
                  )}
                </View>
                {(item.sets || item.reps) && (
                  <Text style={styles.meta}>
                    {item.sets ? `${item.sets} sets` : ""}
                    {item.sets && item.reps ? " × " : ""}
                    {item.reps ? item.reps : ""}
                    {item.usage_count > 0 ? `  ·  used ${item.usage_count}×` : ""}
                  </Text>
                )}
                {item.note ? (
                  <Text style={styles.note} numberOfLines={3}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
              {item.source === "manual" && item.id ? (
                <TouchableOpacity
                  testID={`delete-exercise-${item.id}`}
                  onPress={() => remove(item.id!)}
                  style={styles.deleteBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.onSurfaceSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setAddOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>ADD EXERCISE</Text>
            <TextInput
              testID="exercise-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Exercise name"
              placeholderTextColor={colors.onSurfaceSecondary}
            />
            <TextInput
              testID="exercise-note-input"
              style={[styles.input, { minHeight: 90, textAlignVertical: "top", marginTop: spacing.md }]}
              value={note}
              onChangeText={setNote}
              placeholder="Coaching cue / form note (optional)"
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
            />
            <Button
              testID="save-exercise-btn"
              title="Save to Library"
              onPress={add}
              loading={saving}
              style={{ marginTop: spacing.lg }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    minHeight: 48,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: fonts.regular, fontSize: 15, minHeight: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  emptyText: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary, textAlign: "center" },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  manualChip: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  manualText: { fontFamily: fonts.bold, fontSize: 9, color: colors.onBrandTertiary, letterSpacing: 0.6 },
  meta: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 3 },
  note: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, marginTop: 4, lineHeight: 18 },
  deleteBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.lg },
  modalTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  input: {
    minHeight: 52,
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
});
