export const colors = {
  surface: "#121214",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1C1C1E",
  onSurfaceSecondary: "#A1A1A8",
  surfaceTertiary: "#2C2C2E",
  onSurfaceTertiary: "#EBEBF5",
  brand: "#FF4B3A",
  onBrand: "#FFFFFF",
  brandSecondary: "#FF7B6E",
  brandTertiary: "#4A1A15",
  onBrandTertiary: "#FFBDB8",
  success: "#32D74B",
  warning: "#FFD60A",
  error: "#FF453A",
  border: "#2C2C2E",
  borderStrong: "#48484A",
  divider: "#1C1C1E",
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

export const images = {
  dashboardHero:
    "https://images.pexels.com/photos/3253515/pexels-photo-3253515.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  premiumHero:
    "https://images.unsplash.com/photo-1705468616275-616b7c01d317?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
  workoutCardBg:
    "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
};

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
