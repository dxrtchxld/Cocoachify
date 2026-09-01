import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Card, EmptyState, Loading, Pill, ScreenHeader, SectionTitle } from "@/src/components/studio/UI";
import { api, privateFileUrl, uploadPrivateFile } from "@/src/lib/api";
import { colors, fonts, spacing } from "@/src/theme";

type LibFile = {
  id: string;
  title: string;
  kind: string;
  size: number;
  visibility: string;
  created_at: string;
};

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  image: "image",
  video: "videocam",
  audio: "musical-notes",
  pdf: "document-text",
  doc: "document",
};

export default function LibraryScreen() {
  const [files, setFiles] = useState<LibFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setFiles(await api<LibFile[]>("/library/files"));
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pickAndUpload = async () => {
    setError("");
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      await uploadPrivateFile(
        { uri: asset.uri, name: asset.name ?? "file", mimeType: asset.mimeType },
        { title: asset.name, visibility: "private" },
      );
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleShare = async (f: LibFile) => {
    const visibility = f.visibility === "clients" ? "private" : "clients";
    await api(`/library/files/${f.id}/share`, { method: "PUT", body: { visibility, client_ids: [] } });
    load();
  };

  const open = async (f: LibFile) => {
    try {
      const url = await privateFileUrl(f.id);
      await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      setError(e?.message ?? "Could not open file");
    }
  };

  const remove = async (f: LibFile) => {
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    await api(`/library/files/${f.id}`, { method: "DELETE" }).catch(load);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Private Library"
        subtitle="Stored in private storage · authorized downloads only"
        right={
          <TouchableOpacity testID="upload-file-btn" style={styles.iconBtn} onPress={pickAndUpload}>
            {uploading ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Ionicons name="cloud-upload" size={22} color={colors.brand} />
            )}
          </TouchableOpacity>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {files.length === 0 ? (
            <EmptyState
              testID="library-empty"
              icon="folder-open-outline"
              title="Library is empty"
              body="Upload worksheets, recordings, PDFs or images. Attach them to lessons or share them with clients."
            />
          ) : (
            <>
              <SectionTitle>{`${files.length} FILES`}</SectionTitle>
              <View style={{ gap: spacing.sm }}>
                {files.map((f) => (
                  <Card key={f.id} testID={`file-${f.id}`} style={{ gap: spacing.sm }}>
                    <View style={styles.row}>
                      <View style={styles.iconWrap}>
                        <Ionicons name={ICONS[f.kind] ?? "document"} size={18} color={colors.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.title} numberOfLines={1}>
                          {f.title}
                        </Text>
                        <Text style={styles.meta}>
                          {f.kind.toUpperCase()} · {(f.size / 1024 / 1024).toFixed(1)} MB
                        </Text>
                      </View>
                      <Pill
                        label={f.visibility === "clients" ? "SHARED" : f.visibility === "course" ? "COURSE" : "PRIVATE"}
                        tone={f.visibility === "private" ? "neutral" : "gold"}
                      />
                    </View>
                    <View style={{ flexDirection: "row", gap: spacing.lg }}>
                      <TouchableOpacity testID={`open-file-${f.id}`} onPress={() => open(f)}>
                        <Text style={styles.action}>Open</Text>
                      </TouchableOpacity>
                      <TouchableOpacity testID={`share-file-${f.id}`} onPress={() => toggleShare(f)}>
                        <Text style={styles.action}>
                          {f.visibility === "clients" ? "Make private" : "Share with clients"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity testID={`delete-file-${f.id}`} onPress={() => remove(f)}>
                        <Text style={styles.remove}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
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
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  action: { fontFamily: fonts.bold, fontSize: 12, color: colors.brand },
  remove: { fontFamily: fonts.bold, fontSize: 12, color: colors.error },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error, marginBottom: spacing.sm },
});
