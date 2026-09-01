import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { api, mediaUrl, uploadImage } from "../lib/api";
import { colors, fonts, radius, spacing } from "../theme";
import { Sheet } from "./studio/UI";

type Cover = { id: string; label?: string; category?: string; url: string };

/** Pick a ready-made cover, reuse a previous upload, or upload a new photo. */
export default function CoverPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [presets, setPresets] = useState<Cover[]>([]);
  const [mine, setMine] = useState<Cover[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api<{ presets: Cover[]; mine: Cover[] }>("/covers")
      .then((res) => {
        setPresets(res.presets);
        setMine(res.mine);
      })
      .catch(() => setError("Could not load the cover library"))
      .finally(() => setLoading(false));
  }, [visible]);

  const pickFromPhotos = async () => {
    setError("");
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      if (!perm.canAskAgain) {
        setError("Photo access is blocked. Open Settings to allow it.");
        return;
      }
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") {
      setError("Photo access is needed to upload your own cover.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (res.canceled || !res.assets?.length) return;
    setUploading(true);
    try {
      const url = await uploadImage(res.assets[0].uri);
      onPick(url);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const grouped = presets.reduce<Record<string, Cover[]>>((acc, c) => {
    const key = c.category ?? "other";
    acc[key] = [...(acc[key] ?? []), c];
    return acc;
  }, {});

  return (
    <Sheet visible={visible} onClose={onClose} title="Cover photo">
      {loading ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <>
          <TouchableOpacity testID="upload-cover-btn" style={styles.uploadRow} onPress={pickFromPhotos}>
            {uploading ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Ionicons name="cloud-upload" size={20} color={colors.brand} />
            )}
            <Text style={styles.uploadText}>{uploading ? "Uploading…" : "Upload my own photo"}</Text>
          </TouchableOpacity>

          {error ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.error}>{error}</Text>
              {error.includes("Settings") ? (
                <TouchableOpacity testID="open-settings-btn" onPress={() => Linking.openSettings()}>
                  <Text style={styles.link}>Open Settings</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {mine.length > 0 ? (
            <>
              <Text style={styles.groupLabel}>MY UPLOADS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.rowStrip}>
                  {mine.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      testID={`cover-mine-${c.id}`}
                      onPress={() => {
                        onPick(c.url);
                        onClose();
                      }}
                    >
                      <Image source={{ uri: mediaUrl(c.url) ?? c.url }} style={styles.thumb} />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          ) : null}

          {Object.entries(grouped).map(([cat, items]) => (
            <View key={cat}>
              <Text style={styles.groupLabel}>{cat.toUpperCase()}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.rowStrip}>
                  {items.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      testID={`cover-${c.id}`}
                      onPress={() => {
                        onPick(c.url);
                        onClose();
                      }}
                    >
                      <Image source={{ uri: c.url }} style={styles.thumb} />
                      <Text style={styles.thumbLabel} numberOfLines={1}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          ))}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  uploadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  uploadText: { fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.brand },
  groupLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  rowStrip: { flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm },
  thumb: {
    width: 132,
    height: 78,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
  },
  thumbLabel: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    color: colors.onSurfaceSecondary,
    marginTop: 4,
    width: 132,
  },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
  link: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.brand },
});
