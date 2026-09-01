import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Linking,
  Platform,
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

export default function ProgramImport() {
  const insets = useSafeAreaInsets();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const pick = async (source: "library" | "camera") => {
    setError(null);
    try {
      if (source === "camera" && Platform.OS !== "web") {
        const current = await ImagePicker.getCameraPermissionsAsync();
        if (!current.granted) {
          const req = await ImagePicker.requestCameraPermissionsAsync();
          if (!req.granted) {
            if (!req.canAskAgain) setPermissionBlocked(true);
            return;
          }
        }
      }
      const result =
        source === "camera" && Platform.OS !== "web"
          ? await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.7,
              base64: true,
            });
      if (!result.canceled && result.assets[0]?.base64) {
        setImageUri(result.assets[0].uri);
        setImageBase64(result.assets[0].base64);
      }
    } catch {
      setError("Couldn't open the picker. Try again.");
    }
  };

  // Photos/Camera pickers only surface the device's photo library — they never
  // show Google Drive, Files (iOS) or other cloud sources. The system
  // document/file picker (Storage Access Framework on Android, Files app on
  // iOS) is the one that lists Google Drive if it's installed.
  const pickFromFiles = async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (Platform.OS === "web" && asset.file) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(asset.file as Blob);
        });
        setImageUri(asset.uri);
        setImageBase64(base64);
        return;
      }
      const file = new File(asset.uri);
      const base64 = await file.base64();
      setImageUri(asset.uri);
      setImageBase64(base64);
    } catch {
      setError("Couldn't read that file. Try picking a different one.");
    }
  };

  const extract = async () => {
    if (!imageBase64) return;
    setExtracting(true);
    setError(null);
    try {
      const res = await api<{ program_id: string; name: string; sessions_created: number }>(
        "/programs/import-image",
        { method: "POST", body: { image_base64: imageBase64 } },
      );
      router.replace({ pathname: "/program-editor", params: { id: res.program_id } });
    } catch (e: any) {
      setError(e?.message || "Extraction failed. Try a clearer photo.");
      setExtracting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 140 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.title}>IMPORT PROGRAM</Text>
          <View style={{ width: 44 }} />
        </View>

        <Text style={styles.sub}>
          Snap a photo of a written program, pick one from Photos, or import from{" "}
          <Text style={{ fontFamily: fonts.bold, color: colors.onSurface }}>Files — including Google Drive</Text>{" "}
          if you have it installed. AI will turn it into an editable program.
        </Text>

        <View style={styles.pickRow}>
          {Platform.OS !== "web" && (
            <TouchableOpacity testID="pick-camera" style={styles.pickCard} onPress={() => pick("camera")}>
              <Ionicons name="camera" size={28} color={colors.brand} />
              <Text style={styles.pickText}>Take Photo</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity testID="pick-library" style={styles.pickCard} onPress={() => pick("library")}>
            <Ionicons name="images" size={28} color={colors.brand} />
            <Text style={styles.pickText}>Photos</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="pick-files" style={styles.pickCard} onPress={pickFromFiles}>
            <Ionicons name="cloud-outline" size={28} color={colors.brand} />
            <Text style={styles.pickText}>Files / Drive</Text>
          </TouchableOpacity>
        </View>

        {permissionBlocked && (
          <View style={styles.permCard}>
            <Text style={styles.permText}>
              Camera access is turned off. Enable it in Settings to snap program photos.
            </Text>
            <Button
              title="Open Settings"
              variant="secondary"
              onPress={() => Linking.openSettings()}
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}

        {imageUri && (
          <View style={styles.previewWrap}>
            <Image source={{ uri: imageUri }} style={styles.preview} contentFit="contain" />
          </View>
        )}

        {extracting && (
          <View style={styles.extractingCard}>
            <Ionicons name="sparkles" size={20} color={colors.brand} />
            <Text style={styles.extractingText}>
              AI is reading your program — exercises, sets, reps and days. This takes ~20 seconds.
            </Text>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          testID="extract-btn"
          title="Extract with AI"
          onPress={extract}
          loading={extracting}
          disabled={!imageBase64}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface, letterSpacing: 1 },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.onSurfaceSecondary,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  pickRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  pickCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 110,
  },
  pickText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onSurface },
  permCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  permText: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 19 },
  previewWrap: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
  },
  preview: { width: "100%", height: 320 },
  extractingCard: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  extractingText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18, color: colors.onSurface },
  errorText: { fontFamily: fonts.medium, fontSize: 13, color: colors.error, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
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
});
