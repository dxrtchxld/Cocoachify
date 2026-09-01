import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useState } from "react";
import { Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BACKEND_URL, api, mediaUrl } from "@/src/lib/api";
import { Card, EmptyState, Loading, ScreenHeader } from "@/src/components/studio/UI";
import { colors, fonts, spacing } from "@/src/theme";

const pdfUrl = (code: string) => `${BACKEND_URL}/api/public/certificates/${code}/pdf`;

type Certificate = {
  id: string;
  code: string;
  course_title: string;
  client_name: string;
  coach_name: string;
  brand_logo: string | null;
  lesson_count: number;
  issued_at: string;
};

export default function Certificates() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setCerts(await api<Certificate[]>("/studio/certificates"));
    } catch {
      setCerts([]);
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
      <ScreenHeader title="Certificates" subtitle="Issued automatically at 100% completion" />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
          {certs.length === 0 ? (
            <EmptyState
              testID="certs-empty"
              icon="ribbon-outline"
              title="No certificates yet"
              body="Finish every lesson in a course and a certificate appears here."
            />
          ) : (
            certs.map((c) => {
              const logo = mediaUrl(c.brand_logo);
              return (
                <Card key={c.id} testID={`certificate-${c.id}`} style={styles.cert}>
                  {logo ? <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" /> : null}
                  <Text style={styles.kicker}>CERTIFICATE OF COMPLETION</Text>
                  <Text style={styles.name}>{c.client_name}</Text>
                  <Text style={styles.body}>has completed</Text>
                  <Text style={styles.course}>{c.course_title}</Text>
                  <Text style={styles.body}>
                    {c.lesson_count} {c.lesson_count === 1 ? "lesson" : "lessons"} · coached by {c.coach_name}
                  </Text>
                  <View style={styles.rule} />
                  <Text style={styles.meta}>
                    {new Date(c.issued_at).toLocaleDateString()} · No. {c.code}
                  </Text>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      testID={`cert-pdf-${c.id}`}
                      style={styles.action}
                      onPress={() => WebBrowser.openBrowserAsync(pdfUrl(c.code))}
                    >
                      <Ionicons name="download-outline" size={15} color={colors.brand} />
                      <Text style={styles.actionText}>Download PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`cert-share-${c.id}`}
                      style={styles.action}
                      onPress={() =>
                        Share.share({
                          title: c.course_title,
                          message: `I completed “${c.course_title}” with ${c.coach_name}. Verify certificate ${c.code}: ${pdfUrl(c.code)}`,
                          url: pdfUrl(c.code),
                        })
                      }
                    >
                      <Ionicons name="share-outline" size={15} color={colors.brand} />
                      <Text style={styles.actionText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  cert: { alignItems: "center", gap: spacing.sm, borderColor: colors.brandSecondary, paddingVertical: spacing.xxl },
  logo: { width: 110, height: 40, marginBottom: spacing.sm },
  kicker: { fontFamily: fonts.bold, fontSize: 10, color: colors.brand, letterSpacing: 2 },
  name: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, textAlign: "center" },
  course: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.brand, textAlign: "center" },
  body: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, textAlign: "center" },
  rule: { height: 1, width: "60%", backgroundColor: colors.border, marginVertical: spacing.sm },
  meta: { fontFamily: fonts.medium, fontSize: 11, color: colors.onSurfaceSecondary, letterSpacing: 0.5 },
  actions: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.md },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: spacing.sm },
  actionText: { fontFamily: fonts.bold, fontSize: 12, color: colors.brand },
});
