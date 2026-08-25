import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { categoryMeta, colors, fonts, radius, spacing } from "@/src/theme";

type Program = {
  id: string;
  name: string;
  description: string;
  category: string;
  total_days: number;
  days_per_week: number;
  difficulty: string;
  session_count: number;
};

const CATEGORIES = ["all", "fitness", "breathwork", "yoga", "mobility", "mindfulness"];

export default function Programs() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const isCoach = user?.role === "coach";

  const load = useCallback(async () => {
    try {
      setPrograms(await api<Program[]>("/programs"));
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

  const filtered = programs.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      (!query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase())),
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>PROGRAMS</Text>
        {isCoach && (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity
              testID="import-program-btn"
              style={styles.importBtn}
              onPress={() => router.push("/program-import")}
              activeOpacity={0.85}
            >
              <Ionicons name="camera" size={18} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="new-program-btn"
              style={styles.newBtn}
              onPress={() => router.push("/program-editor")}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color={colors.onBrand} />
              <Text style={styles.newText}>New</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
        <TextInput
          testID="program-search"
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search programs..."
          placeholderTextColor={colors.onSurfaceSecondary}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 48 }}
        contentContainerStyle={styles.catRow}
      >
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            testID={`cat-${c}`}
            style={[styles.catChip, category === c && styles.catChipActive]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.catText, category === c && styles.catTextActive]}>
              {c === "all" ? "All" : `${categoryMeta[c]?.emoji ?? ""} ${capitalize(c)}`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="albums-outline" size={44} color={colors.onSurfaceSecondary} />
          <Text style={styles.emptyTitle}>
            {programs.length === 0 ? "No programs yet" : "No matches"}
          </Text>
          {programs.length === 0 && isCoach && (
            <TouchableOpacity
              testID="empty-new-program"
              style={{ marginTop: spacing.md, minHeight: 44, justifyContent: "center" }}
              onPress={() => router.push("/program-editor")}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.brand }}>
                Create your first program
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.md, gap: spacing.md }}
          renderItem={({ item }) => {
            const meta = categoryMeta[item.category] ?? categoryMeta.fitness;
            return (
              <TouchableOpacity
                testID={`program-card-${item.id}`}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: "/program/[id]", params: { id: item.id } })}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.catBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.catBadgeText, { color: meta.color }]}>
                      {meta.emoji} {item.category.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.daysChip}>
                    <Text style={styles.daysChipText}>{item.total_days}d</Text>
                  </View>
                </View>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.cardDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={styles.cardMeta}>
                  {capitalize(item.difficulty)} · {item.days_per_week} days/week ·{" "}
                  {item.session_count} training days
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, letterSpacing: 1 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    borderRadius: radius.pill,
  },
  newText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onBrand },
  importBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
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
    marginBottom: spacing.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: fonts.regular, fontSize: 15, minHeight: 48 },
  catRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, alignItems: "center" },
  catChip: {
    paddingHorizontal: spacing.lg,
    height: 38,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  catChipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  catText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceSecondary },
  catTextActive: { color: colors.onSurface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  catBadgeText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8 },
  daysChip: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  daysChipText: { fontFamily: fonts.bold, fontSize: 11, color: colors.onSurfaceTertiary },
  cardTitle: { fontFamily: fonts.displayBold, fontSize: 19, color: colors.onSurface, marginTop: spacing.sm },
  cardDesc: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.onSurfaceSecondary, marginTop: 4 },
  cardMeta: { fontFamily: fonts.semiBold, fontSize: 11.5, color: colors.onSurfaceTertiary, marginTop: spacing.sm },
});
