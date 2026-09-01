import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { EmptyState, Loading, Row, ScreenHeader, SectionTitle } from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type Client = { user_id: string; name: string; status?: string; program_name?: string | null };

export default function ClientsPlansScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setClients(await api<Client[]>("/coach/clients"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Coaching Plans"
        subtitle="Milestones, goals, assignments, notes"
        right={
          <TouchableOpacity
            testID="checkin-forms-btn"
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            onPress={() => router.push("/studio/checkins")}
          >
            <Ionicons name="clipboard-outline" size={22} color={colors.brand} />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {clients.length === 0 ? (
            <EmptyState icon="people-outline" title="No clients connected" body="Invite a client to start building their plan." />
          ) : (
            <>
              <SectionTitle>{`${clients.length} CLIENTS`}</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                {clients.map((c) => (
                  <Row
                    key={c.user_id}
                    testID={`plan-client-${c.user_id}`}
                    icon="clipboard"
                    title={c.name}
                    subtitle={c.program_name ?? "No active program"}
                    onPress={() => router.push(`/studio/client-plan/${c.user_id}`)}
                  />
                ))}
              </View>
              <Text style={styles.note}>
                Private notes stay with you. Only the “shared with client” part of a note is ever visible in
                their portal.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  note: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
    marginTop: spacing.lg,
  },
});
