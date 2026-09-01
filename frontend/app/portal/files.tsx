import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { EmptyState, Loading, ScreenHeader, SectionTitle } from "@/src/components/studio/UI";
import { api, privateFileUrl } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type LibFile = { id: string; title: string; kind: string; size: number };

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  image: "image",
  video: "videocam",
  audio: "musical-notes",
  pdf: "document-text",
  doc: "document",
};

export default function PortalFiles() {
  const [files, setFiles] = useState<LibFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setFiles(await api<LibFile[]>("/library/shared"));
    } catch (e: any) {
      setError(e?.message ?? "Could not load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = async (f: LibFile) => {
    try {
      await WebBrowser.openBrowserAsync(await privateFileUrl(f.id));
    } catch (e: any) {
      setError(e?.message ?? "Could not open file");
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Shared With Me" subtitle="Only you and your coach can open these" />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {files.length === 0 ? (
            <EmptyState testID="shared-empty" icon="folder-outline" title="Nothing shared yet" body="Worksheets and recordings from your coach will appear here." />
          ) : (
            <>
              <SectionTitle>{`${files.length} FILES`}</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                {files.map((f) => (
                  <TouchableOpacity key={f.id} testID={`shared-${f.id}`} style={styles.row} onPress={() => open(f)}>
                    <Ionicons name={ICONS[f.kind] ?? "document"} size={20} color={colors.brand} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>{f.title}</Text>
                      <Text style={styles.meta}>
                        {f.kind.toUpperCase()} · {(f.size / 1024 / 1024).toFixed(1)} MB
                      </Text>
                    </View>
                    <Ionicons name="download-outline" size={18} color={colors.onSurfaceSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
  },
  title: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error, marginBottom: spacing.sm },
});
