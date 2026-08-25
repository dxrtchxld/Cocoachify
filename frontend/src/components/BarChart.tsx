import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { colors, fonts } from "../theme";

type Props = {
  data: { value: number }[];
  width: number;
  height?: number;
  color?: string;
};

export default function BarChart({
  data,
  width,
  height = 140,
  color = colors.brand,
}: Props) {
  if (data.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>No data yet</Text>
      </View>
    );
  }
  const pad = 8;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const innerW = width - pad * 2;
  const gap = 6;
  const barW = Math.max(6, Math.min(28, innerW / data.length - gap));
  const totalBarsW = data.length * (barW + gap) - gap;
  const startX = pad + (innerW - totalBarsW) / 2;
  return (
    <Svg width={width} height={height}>
      {data.map((d, i) => {
        const h = Math.max(4, (d.value / max) * (height - 24));
        return (
          <Rect
            key={i}
            x={startX + i * (barW + gap)}
            y={height - h - 8}
            width={barW}
            height={h}
            rx={4}
            fill={i === data.length - 1 ? color : colors.surfaceTertiary}
          />
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
  },
});
