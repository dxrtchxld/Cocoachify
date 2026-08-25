import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function Invite() {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const invite = await api<{ code: string }>("/invites", { method: "POST" });
        setCode(invite.code);
      } catch {
        setCode(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const share = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Join me on Co-Coachify! Enter my coach code in Settings: ${code}`,
      });
    } catch {
      // user dismissed
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>INVITE A CLIENT</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : !code ? (
        <View style={styles.centered}>
          <Text style={styles.sub}>Couldn&apos;t create an invite. Try again later.</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.sub}>
            Ask your client to scan this QR code, or enter the code in Settings → &quot;Have a
            coach code?&quot;
          </Text>
          <View style={styles.qrCard}>
            <QRCode value={code} size={200} backgroundColor="#F4F4F5" color="#121214" />
          </View>
          <TouchableOpacity testID="copy-code-btn" style={styles.codeBox} onPress={copy} activeOpacity={0.8}>
            <Text style={styles.codeText}>{code}</Text>
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={20}
              color={copied ? colors.success : colors.onSurfaceSecondary}
            />
          </TouchableOpacity>
          {copied && <Text style={styles.copiedText}>Copied!</Text>}
          <Button
            testID="share-invite-btn"
            title="Share Invite"
            onPress={share}
            style={{ alignSelf: "stretch", marginTop: spacing.xl }}
          />
        </View>
      )}
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
  title: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, letterSpacing: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  body: { flex: 1, alignItems: "center", padding: spacing.xl, paddingTop: spacing.xxl },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  qrCard: {
    backgroundColor: "#F4F4F5",
    padding: spacing.xl,
    borderRadius: radius.lg,
    marginTop: spacing.xxl,
  },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
    marginTop: spacing.xl,
  },
  codeText: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, letterSpacing: 4 },
  copiedText: { fontFamily: fonts.medium, fontSize: 12, color: colors.success, marginTop: spacing.sm },
});
