export const colors = {
  surface: "#0A0A0A",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#161616",
  onSurfaceSecondary: "#A3A3A3",
  surfaceTertiary: "#222222",
  onSurfaceTertiary: "#D4D4D4",
  brand: "#E5D0A1",
  onBrand: "#0A0A0A",
  brandSecondary: "#B39D73",
  brandTertiary: "#2A261C",
  onBrandTertiary: "#E5D0A1",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  border: "#262626",
  borderStrong: "#404040",
  divider: "#1F1F1F",
  scrimTop: "rgba(10,10,10,0)",
  scrimMid: "rgba(10,10,10,0.55)",
  scrimBottom: "rgba(10,10,10,0.94)",
  glass: "rgba(22,22,22,0.72)",
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
  xl: 28,
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

export const categoryMeta: Record<string, { icon: string; color: string; bg: string }> = {
  fitness: { icon: "barbell", color: "#F0B27A", bg: "rgba(240,178,122,0.14)" },
  breathwork: { icon: "cloud", color: "#8EC5FF", bg: "rgba(142,197,255,0.14)" },
  yoga: { icon: "leaf", color: "#C4B0FF", bg: "rgba(196,176,255,0.14)" },
  mobility: { icon: "body", color: "#F5D77E", bg: "rgba(245,215,126,0.14)" },
  mindfulness: { icon: "sparkles", color: "#86EFAC", bg: "rgba(134,239,172,0.14)" },
};

// Cinematic cover images per category (Luxe Dark blueprint)
const COVER_STRENGTH =
  "https://images.unsplash.com/photo-1775993167276-743bbcde77e1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwxfHxwcmVtaXVtJTIwZml0bmVzcyUyMHN0cmVuZ3RoJTIwdHJhaW5pbmclMjB3b3Jrb3V0fGVufDB8fHx8MTc4ODIyOTYyM3ww&ixlib=rb-4.1.0&q=85";
const COVER_MIND =
  "https://images.unsplash.com/photo-1680543254043-477fb4dc4677?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwxfHxtaW5kZnVsbmVzcyUyMHlvZ2ElMjBicmVhdGh3b3JrJTIwc3R1ZGlvfGVufDB8fHx8MTc4ODIyOTYyM3ww&ixlib=rb-4.1.0&q=85";
const COVER_YOGA =
  "https://images.unsplash.com/photo-1787089574609-c3757a355bec?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwyfHxtaW5kZnVsbmVzcyUyMHlvZ2ElMjBicmVhdGh3b3JrJTIwc3R1ZGlvfGVufDB8fHx8MTc4ODIyOTYyM3ww&ixlib=rb-4.1.0&q=85";

export const categoryCover: Record<string, string> = {
  fitness: COVER_STRENGTH,
  mobility: COVER_STRENGTH,
  breathwork: COVER_MIND,
  mindfulness: COVER_MIND,
  yoga: COVER_YOGA,
};

export function coverFor(category?: string | null, custom?: string | null): string {
  if (custom) {
    if (custom.startsWith("http")) return custom;
    if (custom.startsWith("/")) return `${process.env.EXPO_PUBLIC_BACKEND_URL ?? ""}${custom}`;
    return custom;
  }
  return categoryCover[category ?? "fitness"] ?? COVER_STRENGTH;
}
