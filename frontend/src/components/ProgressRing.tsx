import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors, fonts } from "../theme";

type Props = {
  size?: number;
  strokeWidth?: number;
  progress: number; // 0..1
  color?: string;
  value: string;
  label: string;
};

export default function ProgressRing({
  size = 96,
  strokeWidth = 8,
  progress,
  color = colors.brand,
  value,
  label,
}: Props) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, alignItems: "center" }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.surfaceTertiary}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${c}`}
            strokeDashoffset={c * (1 - clamped)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.center}>
          <Text style={styles.value}>{value}</Text>
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.onSurface,
  },
  label: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },
});
