import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Scrim from "@/src/components/Scrim";
import { useAuth } from "@/src/context/AuthContext";
import { ACCENTS, FONT_PACKS, useTheme } from "@/src/context/ThemeContext";
import { api, mediaUrl, uploadImage } from "@/src/lib/api";
import { colors, coverFor, fonts, radius, spacing } from "@/src/theme";

export default function BrandStudio() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { accentColor, fontPack, setAccent, setFontPack } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [tagline, setTagline] = useState(user?.brand_tagline ?? "");
  const [savingTagline, setSavingTagline] = useState(false);
  const isPremium = !!user?.is_premium;

  const logoUrl = mediaUrl(user?.brand_logo);
  const bannerUrl = mediaUrl(user?.brand_banner);

  const pickLogo = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to upload your logo.",
        Platform.OS === "web"
          ? [{ text: "OK" }]
          : [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
    });
    if (res.canceled || !res.assets?.length) return;
    setUploading(true);
    try {
      const url = await uploadImage(res.assets[0].uri);
      await api("/me/brand", { method: "PUT", body: { logo_url: url } });
      await refreshUser();
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message || "Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    setUploading(true);
    try {
      await api("/me/brand", { method: "PUT", body: { logo_url: null } });
      await refreshUser();
    } finally {
      setUploading(false);
    }
  };

  const pickBanner = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to upload a banner.",
        Platform.OS === "web"
          ? [{ text: "OK" }]
          : [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (res.canceled || !res.assets?.length) return;
    setBannerUploading(true);
    try {
      const url = await uploadImage(res.assets[0].uri);
      await api("/me/brand", { method: "PUT", body: { banner_url: url } });
      await refreshUser();
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message || "Please try again.");
    } finally {
      setBannerUploading(false);
    }
  };

  const removeBanner = async () => {
    setBannerUploading(true);
    try {
      await api("/me/brand", { method: "PUT", body: { banner_url: null } });
      await refreshUser();
    } finally {
      setBannerUploading(false);
    }
  };

  const saveTagline = async () => {
    setSavingTagline(true);
    try {
      await api("/me/brand", { method: "PUT", body: { tagline: tagline.trim() || null } });
      await refreshUser();
    } finally {
      setSavingTagline(false);
    }
  };

  const pickAccent = (a: (typeof ACCENTS)[number]) => {
    if (a.premium && !isPremium) {
      Alert.alert("Premium color", "Upgrade to premium to unlock this theme color.");
      return;
    }
    setAccent(a);
  };

  const pickFontPack = (p: (typeof FONT_PACKS)[number]) => {
    if (p.premium && !isPremium) {
      Alert.alert("Premium typography", "Upgrade to premium to unlock this font pack.");
      return;
    }
    setFontPack(p.key);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Brand Studio</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false}>
        {/* Live preview */}
        <Text style={styles.sectionLabel}>PREVIEW</Text>
        <View style={styles.previewCard}>
          <Image source={{ uri: bannerUrl || coverFor(user?.coach_specialty || "fitness") }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <Scrim />
          <View style={styles.previewTop}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.previewLogo} contentFit="contain" />
            ) : (
              <View style={[styles.previewLogo, styles.logoPlaceholder]}>
                <Text style={styles.logoPlaceholderText}>{(user?.name || "C")[0].toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View>
            <View style={[styles.previewChip, { backgroundColor: accentColor }]}>
              <Text style={[styles.previewChipText, { color: colors.onBrand }]}>YOUR BRAND</Text>
            </View>
            <Text style={styles.previewTitle}>{user?.name || "Your Coaching"}</Text>
            <Text style={styles.previewSub}>{tagline.trim() || "This is how your clients see you."}</Text>
          </View>
        </View>

        {/* Banner */}
        <Text style={styles.sectionLabel}>BANNER</Text>
        <View style={styles.rowCard}>
          <View style={styles.logoThumbWrap}>
            {bannerUrl ? (
              <Image source={{ uri: bannerUrl }} style={styles.logoThumb} contentFit="cover" />
            ) : (
              <Ionicons name="image-outline" size={22} color={colors.onSurfaceSecondary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{bannerUrl ? "Your banner" : "No banner yet"}</Text>
            <Text style={styles.rowSub}>Wide cover photo behind your dashboard header</Text>
          </View>
          {bannerUploading ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <TouchableOpacity testID="upload-banner-btn" onPress={pickBanner} style={styles.uploadBtn}>
              <Ionicons name={bannerUrl ? "swap-horizontal" : "cloud-upload"} size={16} color={colors.onBrand} />
              <Text style={styles.uploadBtnText}>{bannerUrl ? "Replace" : "Upload"}</Text>
            </TouchableOpacity>
          )}
        </View>
        {bannerUrl && !bannerUploading ? (
          <TouchableOpacity testID="remove-banner-btn" onPress={removeBanner} style={styles.removeRow}>
            <Ionicons name="trash-outline" size={15} color={colors.onSurfaceSecondary} />
            <Text style={styles.removeText}>Remove banner</Text>
          </TouchableOpacity>
        ) : null}

        {/* Logo */}
        <Text style={styles.sectionLabel}>LOGO</Text>
        <View style={styles.rowCard}>
          <View style={styles.logoThumbWrap}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoThumb} contentFit="contain" />
            ) : (
              <Ionicons name="image-outline" size={22} color={colors.onSurfaceSecondary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{logoUrl ? "Your logo" : "No logo yet"}</Text>
            <Text style={styles.rowSub}>PNG or JPG · shown on your client-facing screens</Text>
          </View>
          {uploading ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <TouchableOpacity testID="upload-logo-btn" onPress={pickLogo} style={styles.uploadBtn}>
              <Ionicons name={logoUrl ? "swap-horizontal" : "cloud-upload"} size={16} color={colors.onBrand} />
              <Text style={styles.uploadBtnText}>{logoUrl ? "Replace" : "Upload"}</Text>
            </TouchableOpacity>
          )}
        </View>
        {logoUrl && !uploading ? (
          <TouchableOpacity testID="remove-logo-btn" onPress={removeLogo} style={styles.removeRow}>
            <Ionicons name="trash-outline" size={15} color={colors.onSurfaceSecondary} />
            <Text style={styles.removeText}>Remove logo</Text>
          </TouchableOpacity>
        ) : null}

        {/* Studio title */}
        <Text style={styles.sectionLabel}>STUDIO TITLE</Text>
        <Text style={styles.helper}>
          Replaces the auto-generated dashboard title (e.g. &ldquo;Fitness Coach HQ&rdquo;) with your own words.
        </Text>
        <View style={styles.taglineRow}>
          <TextInput
            testID="tagline-input"
            style={styles.taglineInput}
            value={tagline}
            onChangeText={setTagline}
            placeholder="e.g. Strength & Conditioning Studio"
            placeholderTextColor={colors.onSurfaceSecondary}
            maxLength={60}
            onBlur={saveTagline}
          />
          {savingTagline ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <TouchableOpacity testID="save-tagline-btn" onPress={saveTagline} style={styles.smallSaveBtn}>
              <Ionicons name="checkmark" size={18} color={colors.onBrand} />
            </TouchableOpacity>
          )}
        </View>

        {/* Brand color */}
        <Text style={styles.sectionLabel}>BRAND COLOR</Text>
        <Text style={styles.helper}>15 accent colors — 7 free, 8 unlocked with premium.</Text>
        <View style={styles.swatchRow}>
          {ACCENTS.map((a) => {
            const locked = a.premium && !isPremium;
            return (
              <TouchableOpacity
                key={a.name}
                testID={`accent-${a.name}`}
                style={[styles.swatch, { backgroundColor: a.brand }, accentColor === a.brand && styles.swatchActive]}
                onPress={() => pickAccent(a)}
              >
                {locked ? (
                  <Ionicons name="lock-closed" size={14} color={a.onBrand} />
                ) : accentColor === a.brand ? (
                  <Ionicons name="checkmark" size={18} color={a.onBrand} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.colorName}>
          {ACCENTS.find((a) => a.brand === accentColor)?.name ?? "Custom"}
        </Text>

        {/* Typography */}
        <Text style={styles.sectionLabel}>TYPOGRAPHY</Text>
        <Text style={styles.helper}>Choose a heading style — 1 free, 2 unlocked with premium.</Text>
        <View style={{ gap: spacing.sm }}>
          {FONT_PACKS.map((p) => {
            const locked = p.premium && !isPremium;
            const active = fontPack === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                testID={`font-pack-${p.key}`}
                style={[styles.fontRow, active && styles.fontRowActive]}
                onPress={() => pickFontPack(p)}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={[styles.fontRowTitle, { fontFamily: p.display }]}>{p.name}</Text>
                    {locked ? <Ionicons name="lock-closed" size={13} color={colors.onSurfaceSecondary} /> : null}
                  </View>
                  <Text style={styles.rowSub}>{p.sub}</Text>
                </View>
                {active ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.tipCard}>
          <Ionicons name="sparkles" size={16} color={colors.brand} />
          <Text style={styles.tipText}>
            Set a per-program cover photo from any program&apos;s editor to make your library truly yours.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface },
  sectionLabel: { fontFamily: fonts.display, fontSize: 13, color: colors.brand, letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  previewCard: {
    height: 210,
    borderRadius: radius.xl,
    overflow: "hidden",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewTop: { flexDirection: "row" },
  previewLogo: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: "rgba(0,0,0,0.35)" },
  logoPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  logoPlaceholderText: { fontFamily: fonts.displayBold, fontSize: 22, color: "#FFFFFF" },
  previewChip: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  previewChipText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8 },
  previewTitle: { fontFamily: fonts.displayBold, fontSize: 24, color: "#FFFFFF", marginTop: spacing.sm },
  previewSub: { fontFamily: fonts.regular, fontSize: 12.5, color: "rgba(255,255,255,0.82)", marginTop: 2 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 68,
  },
  logoThumbWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoThumb: { width: 48, height: 48 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    borderRadius: radius.pill,
  },
  uploadBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onBrand },
  removeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, alignSelf: "center", minHeight: 36 },
  removeText: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.onSurfaceSecondary },
  helper: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, marginBottom: spacing.md, lineHeight: 18 },
  taglineRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  taglineInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  smallSaveBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  fontRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 64,
  },
  fontRowActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  fontRowTitle: { fontSize: 16, color: colors.onSurface },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  swatch: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  swatchActive: { borderWidth: 3, borderColor: "#FFFFFF" },
  colorName: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurface, marginTop: spacing.md },
  tipCard: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xxl,
  },
  tipText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, color: colors.onBrandTertiary, lineHeight: 18 },
});
