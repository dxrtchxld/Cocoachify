import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, ViewStyle } from "react-native";

import { colors } from "../theme";

/**
 * Bottom-heavy readability scrim placed over hero/cover images.
 * Non-negotiable per the Luxe Dark blueprint: text over imagery must sit on this.
 */
export default function Scrim({ style }: { style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={[colors.scrimTop, colors.scrimMid, colors.scrimBottom]}
      locations={[0, 0.55, 1]}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
    />
  );
}
