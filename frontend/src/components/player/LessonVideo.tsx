import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { storage } from "@/src/utils/storage";
import { colors, fonts, radius, spacing } from "@/src/theme";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

type Props = {
  /** Direct playable URL (already signed for private files). */
  uri: string;
  /** Stable key used to remember the watch position. */
  progressKey: string;
  poster?: string | null;
};

/** Cinematic in-app lesson player: native controls + fullscreen, speed control
 *  and resume-where-you-left-off. */
export default function LessonVideo({ uri, progressKey, poster }: Props) {
  const [speed, setSpeed] = useState(1);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const restored = useRef(false);
  const lastSaved = useRef(0);

  const player = useVideoPlayer({ uri }, (p) => {
    p.timeUpdateEventInterval = 2;
    p.loop = false;
  });

  const { status } = useEvent(player, "statusChange", { status: player.status, error: undefined });
  const { currentTime } = useEvent(player, "timeUpdate", {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  // Resume from the stored position once the media is ready.
  useEffect(() => {
    if (status !== "readyToPlay" || restored.current) return;
    restored.current = true;
    (async () => {
      const saved = await storage.getItem<number>(`video_pos_${progressKey}`, 0);
      const at = typeof saved === "number" ? saved : 0;
      const dur = player.duration || 0;
      if (at > 5 && (!dur || at < dur - 10)) {
        player.currentTime = at;
        setResumedAt(at);
      }
    })();
  }, [status, progressKey, player]);

  // Persist the position as it plays (throttled by timeUpdateEventInterval).
  useEffect(() => {
    if (!restored.current || !currentTime) return;
    if (Math.abs(currentTime - lastSaved.current) < 2) return;
    lastSaved.current = currentTime;
    const dur = player.duration || 0;
    storage.setItem(`video_pos_${progressKey}`, dur && currentTime > dur - 5 ? 0 : Math.floor(currentTime));
  }, [currentTime, progressKey, player]);

  const applySpeed = (s: number) => {
    setSpeed(s);
    player.playbackRate = s;
  };

  const failed = status === "error";

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        <VideoView
          testID="lesson-video-player"
          style={styles.video}
          player={player}
          nativeControls
          allowsFullscreen
          allowsPictureInPicture={false}
          contentFit="contain"
        />
        {status === "loading" && !failed ? (
          <View style={[styles.overlay, { pointerEvents: "none" }]}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.overlayText}>Loading video…</Text>
          </View>
        ) : null}
        {failed ? (
          <View style={styles.overlay}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.error} />
            <Text style={styles.errorText} numberOfLines={3}>
              This video can&apos;t be played here. Try again, or open the lesson on your phone.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Text style={styles.time} testID="lesson-video-time">
          {fmt(currentTime)} {player.duration ? `/ ${fmt(player.duration)}` : ""}
        </Text>
        <View style={styles.speeds}>
          {SPEEDS.map((s) => (
            <Pressable
              key={s}
              testID={`speed-${s}`}
              onPress={() => applySpeed(s)}
              style={[styles.speed, speed === s && styles.speedOn]}
            >
              <Text style={[styles.speedText, speed === s && styles.speedTextOn]}>{s}x</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {resumedAt ? (
        <Pressable
          testID="restart-video-btn"
          onPress={() => {
            player.currentTime = 0;
            setResumedAt(null);
          }}
          style={styles.resume}
        >
          <Ionicons name="play-back-outline" size={14} color={colors.brand} />
          <Text style={styles.resumeText}>Resumed at {fmt(resumedAt)} — start over</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  stage: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: colors.border,
    aspectRatio: 16 / 9,
    justifyContent: "center",
  },
  video: { width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(10,10,10,0.72)",
    padding: spacing.lg,
  },
  overlayText: { fontFamily: fonts.medium, fontSize: 12, color: colors.onSurfaceSecondary },
  errorText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.error, textAlign: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  time: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.onSurfaceSecondary, letterSpacing: 0.4 },
  speeds: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  speed: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  speedOn: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  speedText: { fontFamily: fonts.semiBold, fontSize: 10.5, color: colors.onSurfaceSecondary },
  speedTextOn: { color: colors.brand },
  resume: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  resumeText: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.brand },
});
