import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";

import { colors, fonts, radius, spacing } from "../theme";

type Props = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export default function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  testID,
}: Props) {
  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onPress();
  };
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={handlePress}
      style={[
        styles.base,
        variant === "primary" && { backgroundColor: colors.brand },
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.onBrand : colors.brand} />
      ) : (
        <Text
          style={[
            styles.text,
            variant === "primary" ? { color: colors.onBrand } : styles.textOther,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  primary: {},
  secondary: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  ghost: { backgroundColor: "transparent" },
  disabled: { opacity: 0.5 },
  text: { fontFamily: fonts.bold, fontSize: 16 },
  textOther: { color: colors.onSurface },
});
