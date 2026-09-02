import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError } from "../lib/api";
import { colors, fonts, radius, spacing } from "../theme";

type Guide = {
  name: string;
  overview: string;
  cues: string[];
  mistakes: string[];
  muscles: string[];
  safety_note: string;
  youtube_search_url: string;
  google_search_url: string;
  cached: boolean;
};

export default function ExerciseGuideSheet({
  visible,
  name,
  onClose,
}: {
  visible: boolean;
  name: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);

  useEffect(() => {
    if (!visible || !name) return;
    let active = true;
    setLoading(true);
    setError(null);
    setGuide(null);
    (async () => {
      try {
        const data = await api<Guide>(`/exercise-guide?name=${encodeURIComponent(name)}`);
        if (active) setGuide(data);
      } catch (e) {
        if (active) setError(e instanceof ApiError ? e.message : "Couldn't load the AI guide");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [visible, name]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Ionicons name="sparkles" size={16} color={colors.brand} />
              <Text style={styles.title} numberOfLines={1}>
                {name}
              </Text>
            </View>
            <TouchableOpacity testID="guide-close-btn" onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.loadingText}>Getting AI guidance…</Text>
              </View>
            ) : error ? (
              <View style={styles.centered}>
                <Ionicons name="alert-circle-outline" size={28} color={colors.onSurfaceSecondary} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : guide ? (
              <View style={{ gap: spacing.lg }}>
                {guide.overview ? <Text style={styles.overview}>{guide.overview}</Text> : null}

                {guide.cues.length > 0 && (
                  <View>
                    <Text style={styles.sectionLabel}>FORM CUES</Text>
                    {guide.cues.map((c, i) => (
                      <View key={i} style={styles.bulletRow}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        <Text style={styles.bulletText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {guide.mistakes.length > 0 && (
                  <View>
                    <Text style={styles.sectionLabel}>COMMON MISTAKES</Text>
                    {guide.mistakes.map((m, i) => (
                      <View key={i} style={styles.bulletRow}>
                        <Ionicons name="close-circle" size={14} color={colors.error} />
                        <Text style={styles.bulletText}>{m}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {guide.muscles.length > 0 && (
                  <View>
                    <Text style={styles.sectionLabel}>MUSCLES WORKED</Text>
                    <View style={styles.chipsRow}>
                      {guide.muscles.map((m, i) => (
                        <View key={i} style={styles.chip}>
                          <Text style={styles.chipText}>{m}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    testID="guide-youtube-btn"
                    style={styles.actionBtn}
                    onPress={() => Linking.openURL(guide.youtube_search_url)}
                  >
                    <Ionicons name="logo-youtube" size={16} color={colors.onSurface} />
                    <Text style={styles.actionText}>Watch demos</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="guide-google-btn"
                    style={styles.actionBtn}
                    onPress={() => Linking.openURL(guide.google_search_url)}
                  >
                    <Ionicons name="search" size={16} color={colors.onSurface} />
                    <Text style={styles.actionText}>Search web</Text>
                  </TouchableOpacity>
                </View>

                {guide.safety_note ? <Text style={styles.safetyNote}>{guide.safety_note}</Text> : null}
                <Text style={styles.disclaimer}>
                  AI-generated general guidance, not medical advice. Always listen to your body.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, marginRight: spacing.md },
  title: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, flexShrink: 1 },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  centered: { alignItems: "center", justifyContent: "center", gap: spacing.md, paddingVertical: spacing.xxl },
  loadingText: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary },
  errorText: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary, textAlign: "center" },
  overview: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 21, color: colors.onSurfaceTertiary },
  sectionLabel: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.brandSecondary, letterSpacing: 1, marginBottom: spacing.sm },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  bulletText: { flex: 1, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, color: colors.onSurfaceTertiary },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  chipText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onBrandTertiary },
  actionsRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onSurface },
  safetyNote: { fontFamily: fonts.medium, fontSize: 12, color: colors.warning, lineHeight: 17 },
  disclaimer: { fontFamily: fonts.regular, fontSize: 11, color: colors.onSurfaceSecondary, lineHeight: 15 },
});
