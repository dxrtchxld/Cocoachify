import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Circle, Line } from "react-native-svg";

import { colors, fonts } from "../theme";

type Point = { value: number };

type Props = {
  data: Point[];
  width: number;
  height?: number;
  color?: string;
  unit?: string;
};

export default function LineChart({
  data,
  width,
  height = 160,
  color = colors.brand,
  unit = "",
}: Props) {
  if (data.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>No data yet</Text>
      </View>
    );
  }
  const pad = 16;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const pts = data.map((d, i) => {
    const x = pad + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = pad + innerH - ((d.value - min) / range) * innerH;
    return { x, y };
  });
  const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <View style={{ width }}>
      <View style={styles.minMaxRow}>
        <Text style={styles.minMax}>
          {max}
          {unit}
        </Text>
      </View>
      <Svg width={width} height={height}>
        <Line
          x1={pad}
          y1={pad}
          x2={width - pad}
          y2={pad}
          stroke={colors.border}
          strokeDasharray="4 4"
        />
        <Line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke={colors.border}
          strokeDasharray="4 4"
        />
        {pts.length > 1 && (
          <Polyline
            points={pointsStr}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={color} />
        ))}
      </Svg>
      <View style={styles.minMaxRow}>
        <Text style={styles.minMax}>
          {min}
          {unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
  },
  minMaxRow: {
    paddingHorizontal: 16,
  },
  minMax: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
  },
});
