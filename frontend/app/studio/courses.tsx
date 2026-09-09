import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Button from "@/src/components/Button";
import {
  Card,
  EmptyState,
  Field,
  Loading,
  Pill,
  ScreenHeader,
  Sheet,
} from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { Course } from "@/src/lib/modules";
import { colors, coverFor, fonts, radius, spacing } from "@/src/theme";

export default function CoursesScreen() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setCourses(await api<Course[]>("/studio/courses"));
    } catch {
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const create = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const amount = parseFloat(price) || 0;
      const created = await api<Course>("/studio/courses", {
        method: "POST",
        body: {
          title: title.trim(),
          subtitle: subtitle.trim(),
          pricing_type: amount > 0 ? "one_time" : "free",
          price: amount,
          status: "draft",
        },
      });
      setOpen(false);
      setTitle("");
      setSubtitle("");
      setPrice("");
      await load();
      router.push(`/studio/course/${created.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not create course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Courses"
        subtitle={`${courses.length} total`}
        right={
          <TouchableOpacity testID="new-course-btn" style={styles.iconBtn} onPress={() => setOpen(true)}>
            <Ionicons name="add" size={26} color={colors.brand} />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <Loading />
      ) : courses.length === 0 ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <EmptyState
            testID="courses-empty"
            icon="school-outline"
            title="No courses yet"
            body="Build a course with lessons, drip release and cohorts — separate from your day-to-day programs."
          />
          <Button
            testID="auto-organize-empty-btn"
            title="✨ Auto-Organize from files"
            variant="secondary"
            onPress={() => router.push("/studio/course-import")}
          />
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Card
              testID={`course-${item.id}`}
              style={{ padding: 0, overflow: "hidden" }}
              onPress={() => router.push(`/studio/course/${item.id}`)}
            >
              <Image
                source={{ uri: coverFor(item.category, item.cover_image) }}
                style={styles.cover}
                resizeMode="cover"
              />
              <View style={{ padding: spacing.lg, gap: 6 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Pill
                    label={item.status === "published" ? "LIVE" : "DRAFT"}
                    tone={item.status === "published" ? "good" : "neutral"}
                  />
                </View>
                {item.subtitle ? (
                  <Text style={styles.sub} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {item.lesson_count ?? 0} lessons · {item.enrolled_count ?? 0} enrolled ·{" "}
                  {item.pricing_type === "free" ? "Free" : `$${item.price}`}
                </Text>
              </View>
            </Card>
          )}
        />
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="New course">
        <Field label="TITLE" value={title} onChangeText={setTitle} placeholder="8-Week Strength Foundations" testID="course-title-input" />
        <Field label="SUBTITLE" value={subtitle} onChangeText={setSubtitle} placeholder="For busy professionals" testID="course-subtitle-input" />
        <Field label="PRICE (USD, 0 = FREE)" value={price} onChangeText={setPrice} placeholder="0" keyboardType="numeric" testID="course-price-input" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button testID="create-course-btn" title="Create course" onPress={create} loading={saving} />
        <TouchableOpacity
          testID="auto-organize-link-btn"
          style={styles.altLink}
          onPress={() => {
            setOpen(false);
            router.push("/studio/course-import");
          }}
        >
          <Ionicons name="sparkles" size={14} color={colors.brand} />
          <Text style={styles.altLinkText}>Or auto-organize from files instead</Text>
        </TouchableOpacity>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", height: 130, backgroundColor: colors.surfaceTertiary },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 17, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18 },
  meta: { fontFamily: fonts.semiBold, fontSize: 11.5, color: colors.brandSecondary, letterSpacing: 0.4, marginTop: 2 },
  error: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error },
  radiusRef: { borderRadius: radius.md },
  altLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, paddingVertical: spacing.sm },
  altLinkText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.brand },
});
