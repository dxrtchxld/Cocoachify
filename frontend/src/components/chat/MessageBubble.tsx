import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius, spacing } from "../../theme";

export type ChatMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  text: string;
  created_at: string;
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function DateSeparator({ label }: { label: string }) {
  return (
    <View style={s.dateWrap}>
      <View style={s.dateLine} />
      <Text style={s.dateText}>{label}</Text>
      <View style={s.dateLine} />
    </View>
  );
}

export default function MessageBubble({
  message,
  mine,
  showTail,
  peerInitial,
  peerIsCoach,
}: {
  message: ChatMessage;
  mine: boolean;
  showTail: boolean;
  peerInitial: string;
  peerIsCoach?: boolean;
}) {
  if (mine) {
    return (
      <View style={[s.row, { justifyContent: "flex-end" }]}>
        <View style={s.mineWrap}>
          <LinearGradient
            colors={[colors.brand, colors.brandSecondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.bubble, s.mine, showTail && s.mineTail]}
          >
            <Text style={[s.text, { color: colors.onBrand }]}>{message.text}</Text>
          </LinearGradient>
          {showTail ? (
            <View style={s.metaRow}>
              <Text style={s.metaTime}>{time(message.created_at)}</Text>
              <Ionicons name="checkmark-done" size={13} color={colors.brandSecondary} />
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={s.row}>
      <View style={s.avatarSlot}>
        {showTail ? (
          <View style={s.avatar}>
            <Text style={s.avatarText}>{peerInitial}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ maxWidth: "78%" }}>
        <View style={[s.bubble, s.theirs, showTail && s.theirsTail]}>
          <Text style={s.text}>{message.text}</Text>
        </View>
        {showTail ? (
          <View style={[s.metaRow, { justifyContent: "flex-start" }]}>
            <Text style={s.metaTime}>{time(message.created_at)}</Text>
            {peerIsCoach ? <Text style={s.coachTag}>COACH</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  mineWrap: { maxWidth: "78%", alignItems: "flex-end" },
  avatarSlot: { width: 30 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.onBrandTertiary },
  bubble: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  mine: { borderBottomRightRadius: radius.lg },
  mineTail: { borderBottomRightRadius: 6 },
  theirs: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  theirsTail: { borderBottomLeftRadius: 6 },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, justifyContent: "flex-end" },
  metaTime: { fontFamily: fonts.medium, fontSize: 10, color: colors.onSurfaceSecondary, letterSpacing: 0.3 },
  coachTag: { fontFamily: fonts.bold, fontSize: 9, color: colors.brand, letterSpacing: 0.8 },
  dateWrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.md },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dateText: { fontFamily: fonts.bold, fontSize: 9.5, color: colors.onSurfaceSecondary, letterSpacing: 1.2 },
});
