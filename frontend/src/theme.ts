export const colors = {
  surface: "#0A0F0B",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#131A15",
  onSurfaceSecondary: "#93A398",
  surfaceTertiary: "#1E2921",
  onSurfaceTertiary: "#DCEBE0",
  brand: "#34E27A",
  onBrand: "#06130B",
  brandSecondary: "#7CF5AC",
  brandTertiary: "#0E2A1A",
  onBrandTertiary: "#A8F5C8",
  success: "#32D74B",
  warning: "#FFD60A",
  error: "#FF453A",
  border: "#1E2921",
  borderStrong: "#33453A",
  divider: "#131A15",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const fonts = {
  display: "Oswald-SemiBold",
  displayBold: "Oswald-Bold",
  displayMedium: "Oswald-Medium",
  regular: "Manrope-Regular",
  medium: "Manrope-Medium",
  semiBold: "Manrope-SemiBold",
  bold: "Manrope-Bold",
};

export const logo = require("../assets/images/cc-logo.png");

export const sessionTypeIcon: Record<string, string> = {
  workout: "barbell",
  rest: "moon",
  yoga: "leaf",
  breathwork: "cloud",
  mobility: "body",
  mindfulness: "sparkles",
  recovery: "heart",
};

export const categoryMeta: Record<string, { emoji: string; color: string; bg: string }> = {
  fitness: { emoji: "💪", color: "#FF7B6E", bg: "rgba(255,75,58,0.14)" },
  breathwork: { emoji: "🌬️", color: "#7EC8FF", bg: "rgba(100,180,255,0.14)" },
  yoga: { emoji: "🧘", color: "#B49CFF", bg: "rgba(150,120,255,0.14)" },
  mobility: { emoji: "🤸", color: "#FFD60A", bg: "rgba(255,214,10,0.12)" },
  mindfulness: { emoji: "🌿", color: "#32D74B", bg: "rgba(50,215,75,0.12)" },
};
