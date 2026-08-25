import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Client = {
  user_id: string;
  name: string;
  email: string;
  status: string;
  program_name: string | null;
  current_day: number | null;
  total_days: number | null;
  last_checkin: string | null;
};

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  on_track: { label: "On Track", color: colors.success, bg: "rgba(50,215,75,0.12)" },
  behind: { label: "Behind", color: colors.warning, bg: "rgba(255,214,10,0.12)" },
  no_program: { label: "No active program", color: colors.onSurfaceSecondary, bg: "rgba(255,255,255,0.06)" },
};

export default function Clients() {
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setClients(await api<Client[]>("/coach/clients"));
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

  const filtered = clients.filter(
    (c) =>
      !query.trim() ||
      c.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      c.email.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>CLIENTS</Text>
        <TouchableOpacity
          testID="invite-btn"
          style={styles.inviteBtn}
          onPress={() => router.push("/invite")}
          activeOpacity={0.85}
        >
          <Ionicons name="person-add" size={18} color={colors.onBrand} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
        <TextInput
          testID="client-search"
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search clients..."
          placeholderTextColor={colors.onSurfaceSecondary}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={44} color={colors.onSurfaceSecondary} />
          <Text style={styles.emptyTitle}>
            {clients.length === 0 ? "No clients yet" : "No matches"}
          </Text>
          {clients.length === 0 && (
            <>
              <Text style={styles.emptySub}>
                Share your invite code so clients can connect to you.
              </Text>
              <TouchableOpacity
                testID="empty-invite-btn"
                style={styles.emptyInvite}
                onPress={() => router.push("/invite")}
              >
                <Text style={styles.emptyInviteText}>Invite a client</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.user_id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          renderItem={({ item }) => {
            const s = STATUS_LABEL[item.status] ?? STATUS_LABEL.no_program;
            return (
              <TouchableOpacity
                testID={`client-row-${item.user_id}`}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() =>
                  router.push({ pathname: "/client/[id]", params: { id: item.user_id } })
                }
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(item.name || "C")[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.subText}>
                    {item.program_name
                      ? `${item.program_name} · Day ${item.current_day}/${item.total_days}`
                      : "No active program"}
                  </Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: s.bg }]}>
                  <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
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
  inviteBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginTop: spacing.md },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  emptyInvite: { marginTop: spacing.lg, minHeight: 44, justifyContent: "center" },
  emptyInviteText: { fontFamily: fonts.bold, fontSize: 14, color: colors.brand },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 68,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 16, color: colors.onSurfaceTertiary },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  subText: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontFamily: fonts.bold, fontSize: 10.5 },
});
