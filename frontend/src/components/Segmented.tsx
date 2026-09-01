import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, fonts, radius, spacing } from "../theme";

type Option = { key: string; label: string };

export default function Segmented({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: Option[];
  value: string;
  onChange: (key: string) => void;
  testIDPrefix?: string;
}) {
  return (
    <View style={styles.track}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            testID={testIDPrefix ? `${testIDPrefix}-${o.key}` : undefined}
            style={[styles.segment, active && styles.segmentActive]}
            activeOpacity={0.85}
            onPress={() => onChange(o.key)}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  segmentActive: { backgroundColor: colors.brand },
  label: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceSecondary, letterSpacing: 0.3 },
  labelActive: { color: colors.onBrand },
});
