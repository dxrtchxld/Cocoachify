import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import Scrim from "@/src/components/Scrim";
import { useAuth } from "@/src/context/AuthContext";
import { api, uploadImage } from "@/src/lib/api";
import { categoryMeta, colors, coverFor, fonts, radius, sessionTypeIcon, spacing } from "@/src/theme";

type SessionSummary = { id: string; name: string; session_type: string; target_minutes: number; exercise_count: number };

const CATEGORIES = ["fitness", "breathwork", "yoga", "mobility", "mindfulness"];
const LENGTHS = [7, 14, 21, 28, 42, 56, 84];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

export default function ProgramEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const isEdit = !!id;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const { user } = useAuth();
  const [category, setCategory] = useState(user?.coach_specialty ?? "fitness");
  const [difficulty, setDifficulty] = useState("beginner");
  const [totalDays, setTotalDays] = useState(28);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [schedule, setSchedule] = useState<(string | null)[]>(Array(28).fill(null));
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [pickerDay, setPickerDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api<SessionSummary[]>("/sessions"));
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions]),
  );

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const p = await api<any>(`/programs/${id}`);
        setName(p.name);
        setDescription(p.description ?? "");
        setSpotifyUrl(p.spotify_url ?? "");
        setCoverImage(p.cover_image ?? null);
        setCategory(p.category);
        setDifficulty(p.difficulty);
        setTotalDays(p.total_days);
        setDaysPerWeek(p.days_per_week);
        setSchedule(p.schedule.map((d: any) => d.session_id));
      } catch {
        setError("Couldn't load program.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const changeLength = (len: number) => {
    setTotalDays(len);
    setSchedule((prev) => {
      const next = [...prev];
      if (len > next.length) return [...next, ...Array(len - next.length).fill(null)];
      return next.slice(0, len);
    });
  };

  const sessionById = (sid: string | null) => sessions.find((s) => s.id === sid);

  const pickCover = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to set a cover photo.",
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
      aspect: [16, 10],
    });
    if (res.canceled || !res.assets?.length) return;
    setCoverUploading(true);
    try {
      setCoverImage(await uploadImage(res.assets[0].uri));
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message || "Please try again.");
    } finally {
      setCoverUploading(false);
    }
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Give your program a name.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        category,
        difficulty,
        total_days: totalDays,
        days_per_week: daysPerWeek,
        spotify_url: spotifyUrl.trim() || null,
        cover_image: coverImage,
        schedule,
      };
      if (isEdit) {
        await api(`/programs/${id}`, { method: "PUT", body });
        router.back();
      } else {
        const created = await api<{ id: string }>("/programs", { method: "POST", body });
        router.replace({ pathname: "/program/[id]", params: { id: created.id } });
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't save program.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const weeks: number[][] = [];
  for (let i = 0; i < totalDays; i += 7) {
    weeks.push(Array.from({ length: Math.min(7, totalDays - i) }, (_, j) => i + j));
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
            </TouchableOpacity>
            <Text style={styles.title}>{isEdit ? "EDIT PROGRAM" : "NEW PROGRAM"}</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Program name *</Text>
            <TextInput
              testID="program-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Rowing Strength Program"
              placeholderTextColor={colors.onSurfaceSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Cover photo</Text>
            <TouchableOpacity
              testID="pick-cover-btn"
              style={styles.coverPicker}
              activeOpacity={0.85}
              onPress={pickCover}
              disabled={coverUploading}
            >
              <Image
                source={{ uri: coverFor(category, coverImage) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
              />
              <Scrim />
              <View style={styles.coverOverlay}>
                {coverUploading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name={coverImage ? "swap-horizontal" : "image"} size={20} color="#FFFFFF" />
                    <Text style={styles.coverText}>
                      {coverImage ? "Change cover photo" : "Upload a cover photo"}
                    </Text>
                    <Text style={styles.coverHint}>Defaults to a curated image for the type</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
            {coverImage ? (
              <TouchableOpacity testID="remove-cover-btn" onPress={() => setCoverImage(null)} style={styles.removeCoverRow}>
                <Ionicons name="trash-outline" size={14} color={colors.onSurfaceSecondary} />
                <Text style={styles.removeCoverText}>Use default image</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              testID="program-desc-input"
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
              value={description}
              onChangeText={setDescription}
              placeholder="What this program delivers and who it's for..."
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Spotify / Apple Music URL (optional)</Text>
            <TextInput
              testID="program-spotify-input"
              style={styles.input}
              value={spotifyUrl}
              onChangeText={setSpotifyUrl}
              placeholder="https://open.spotify.com/..."
              placeholderTextColor={colors.onSurfaceSecondary}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Program type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {CATEGORIES.map((c) => {
                const meta = categoryMeta[c];
                const active = category === c;
                return (
                  <TouchableOpacity
                    key={c}
                    testID={`type-${c}`}
                    style={[styles.typeCard, active && styles.typeCardActive]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={{ fontSize: 22 }}>{meta.emoji}</Text>
                    <Text style={[styles.typeText, active && { color: colors.onSurface }]}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Program length</Text>
            <View style={styles.chipWrap}>
              {LENGTHS.map((l) => (
                <TouchableOpacity
                  key={l}
                  testID={`length-${l}`}
                  style={[styles.chip, totalDays === l && styles.chipActive]}
                  onPress={() => changeLength(l)}
                >
                  <Text style={[styles.chipText, totalDays === l && styles.chipTextActive]}>{l} days</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Days per week</Text>
            <View style={styles.chipWrap}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <TouchableOpacity
                  key={d}
                  testID={`dpw-${d}`}
                  style={[styles.circleChip, daysPerWeek === d && styles.chipActive]}
                  onPress={() => setDaysPerWeek(d)}
                >
                  <Text style={[styles.chipText, daysPerWeek === d && styles.chipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.chipWrap}>
              {DIFFICULTIES.map((d) => (
                <TouchableOpacity
                  key={d}
                  testID={`difficulty-${d}`}
                  style={[styles.chip, difficulty === d && styles.chipActive]}
                  onPress={() => setDifficulty(d)}
                >
                  <Text style={[styles.chipText, difficulty === d && styles.chipTextActive]}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Schedule — tap a day to assign a session</Text>
            {sessions.length === 0 && (
              <TouchableOpacity
                testID="create-first-session"
                style={styles.hintCard}
                onPress={() => router.push("/session-editor")}
              >
                <Ionicons name="construct" size={18} color={colors.brand} />
                <Text style={styles.hintText}>
                  You have no sessions yet. Create your first session, then come back — your
                  program draft stays here.
                </Text>
              </TouchableOpacity>
            )}
            {weeks.map((week, wi) => (
              <View key={wi} style={{ marginBottom: spacing.md }}>
                <Text style={styles.weekTitle}>WEEK {wi + 1}</Text>
                {week.map((dayIdx) => {
                  const s = sessionById(schedule[dayIdx]);
                  const isRest = !schedule[dayIdx];
                  return (
                    <TouchableOpacity
                      key={dayIdx}
                      testID={`day-slot-${dayIdx}`}
                      style={styles.dayRow}
                      activeOpacity={0.7}
                      onPress={() => setPickerDay(dayIdx)}
                    >
                      <Text style={styles.dayLabel}>D{dayIdx + 1}</Text>
                      <View style={styles.dayIconWrap}>
                        <Ionicons
                          name={(sessionTypeIcon[s?.session_type ?? "rest"] as any) || "barbell"}
                          size={15}
                          color={isRest ? colors.onSurfaceSecondary : colors.brand}
                        />
                      </View>
                      <Text
                        style={[styles.daySession, isRest && { color: colors.onSurfaceSecondary }]}
                        numberOfLines={1}
                      >
                        {s?.name ?? "Rest Day"}
                      </Text>
                      <Ionicons name="swap-horizontal" size={16} color={colors.onSurfaceSecondary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          testID="save-program-btn"
          title={isEdit ? "Save Changes" : "Create Program"}
          onPress={save}
          loading={saving}
        />
      </View>

      {/* Session picker */}
      <Modal
        visible={pickerDay !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerDay(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setPickerDay(null)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>
              DAY {pickerDay !== null ? pickerDay + 1 : ""} — PICK A SESSION
            </Text>
            <FlatList
              data={[{ id: null, name: "Rest Day", session_type: "rest", target_minutes: 0, exercise_count: 0 } as any, ...sessions]}
              keyExtractor={(s) => s.id ?? "rest"}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`pick-${item.id ?? "rest"}`}
                  style={styles.pickRow}
                  onPress={() => {
                    if (pickerDay !== null) {
                      setSchedule((prev) => {
                        const next = [...prev];
                        next[pickerDay] = item.id;
                        return next;
                      });
                    }
                    setPickerDay(null);
                  }}
                >
                  <View style={styles.dayIconWrap}>
                    <Ionicons
                      name={(sessionTypeIcon[item.session_type] as any) || "barbell"}
                      size={15}
                      color={item.id ? colors.brand : colors.onSurfaceSecondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.daySession}>{item.name}</Text>
                    {item.id ? (
                      <Text style={styles.pickMeta}>
                        {item.target_minutes} min · {item.exercise_count} exercises
                      </Text>
                    ) : null}
                  </View>
                  {pickerDay !== null && schedule[pickerDay] === item.id && (
                    <Ionicons name="checkmark" size={20} color={colors.brand} />
                  )}
                </TouchableOpacity>
              )}
              ListFooterComponent={
                <TouchableOpacity
                  testID="picker-new-session"
                  style={[styles.pickRow, { borderBottomWidth: 0 }]}
                  onPress={() => {
                    setPickerDay(null);
                    router.push("/session-editor");
                  }}
                >
                  <View style={[styles.dayIconWrap, { backgroundColor: colors.brandTertiary }]}>
                    <Ionicons name="add" size={16} color={colors.brand} />
                  </View>
                  <Text style={[styles.daySession, { color: colors.brand }]}>Create a new session</Text>
                </TouchableOpacity>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface, letterSpacing: 1 },
  field: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.surfaceSecondary,
  },
  typeCard: {
    width: 92,
    minHeight: 78,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  typeCardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  coverPicker: {
    height: 150,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  coverOverlay: { alignItems: "center", gap: 4, paddingHorizontal: spacing.lg },
  coverText: { fontFamily: fonts.bold, fontSize: 14, color: "#FFFFFF" },
  coverHint: { fontFamily: fonts.regular, fontSize: 11, color: "rgba(255,255,255,0.8)" },
  removeCoverRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm, alignSelf: "flex-start", minHeight: 32 },
  removeCoverText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurfaceSecondary },
  typeText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.onSurfaceSecondary },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  circleChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  chipText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onSurface },
  hintCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  hintText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18, color: colors.onSurface },
  weekTitle: { fontFamily: fonts.display, fontSize: 12, color: colors.brand, letterSpacing: 1.2, marginBottom: 4, marginTop: spacing.sm },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 48,
  },
  dayLabel: { fontFamily: fonts.display, fontSize: 12, color: colors.onSurfaceSecondary, width: 32 },
  dayIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  daySession: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14, color: colors.onSurface },
  pickMeta: { fontFamily: fonts.regular, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 1 },
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 0.5 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceTertiary,
    minHeight: 54,
  },
});
