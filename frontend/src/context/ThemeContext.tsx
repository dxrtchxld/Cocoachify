import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { useAuth } from "./AuthContext";
import { api } from "../lib/api";
import { colors, fonts } from "../theme";

export type Accent = {
  name: string;
  brand: string;
  onBrand: string;
  secondary: string;
  tertiary: string;
  onTertiary: string;
  premium?: boolean;
};

export const ACCENTS: Accent[] = [
  { name: "Champagne", brand: "#E5D0A1", onBrand: "#0A0A0A", secondary: "#B39D73", tertiary: "#2A261C", onTertiary: "#E5D0A1" },
  { name: "Platinum", brand: "#E7E7EA", onBrand: "#0A0A0A", secondary: "#A1A1AA", tertiary: "#242427", onTertiary: "#E7E7EA" },
  { name: "Emerald", brand: "#34E27A", onBrand: "#06130B", secondary: "#7CF5AC", tertiary: "#0E2A1A", onTertiary: "#A8F5C8" },
  { name: "Sky", brand: "#8EC5FF", onBrand: "#04121F", secondary: "#BFDCFF", tertiary: "#111E2A", onTertiary: "#D6E9FF" },
  { name: "Coral", brand: "#FF6F61", onBrand: "#1F0704", secondary: "#FF9C91", tertiary: "#2A1512", onTertiary: "#FFC7C0" },
  { name: "Violet", brand: "#C4B0FF", onBrand: "#160E2E", secondary: "#D8CCFF", tertiary: "#1D1533", onTertiary: "#E7DEFF" },
  { name: "Rose", brand: "#F5A3C7", onBrand: "#2A0E1A", secondary: "#F9C3DA", tertiary: "#2E1621", onTertiary: "#FCD9E8" },
  { name: "Onyx Gold", brand: "#D4AF37", onBrand: "#1A1400", secondary: "#E8C766", tertiary: "#2A2210", onTertiary: "#E8C766", premium: true },
  { name: "Crimson", brand: "#E5484D", onBrand: "#210505", secondary: "#F27C80", tertiary: "#2E0E10", onTertiary: "#F5A8AB", premium: true },
  { name: "Ocean", brand: "#2DD4BF", onBrand: "#04201C", secondary: "#7EEDE0", tertiary: "#0E2A26", onTertiary: "#A6F3E9", premium: true },
  { name: "Lime", brand: "#BEF264", onBrand: "#131C04", secondary: "#D9F999", tertiary: "#1E2A0C", onTertiary: "#D9F999", premium: true },
  { name: "Magenta", brand: "#F472B6", onBrand: "#240814", secondary: "#F9A8D4", tertiary: "#2E121F", onTertiary: "#FBC7E3", premium: true },
  { name: "Indigo", brand: "#818CF8", onBrand: "#0E1130", secondary: "#A5B4FC", tertiary: "#181B3A", onTertiary: "#C7D2FE", premium: true },
  { name: "Amber", brand: "#FBBF24", onBrand: "#231800", secondary: "#FDD675", tertiary: "#2E2205", onTertiary: "#FDE08A", premium: true },
  { name: "Jade", brand: "#4ADE80", onBrand: "#04170B", secondary: "#86EFAC", tertiary: "#0F2517", onTertiary: "#A7F3C4", premium: true },
];

export type FontPack = {
  key: string;
  name: string;
  sub: string;
  display: string;
  premium?: boolean;
};

export const FONT_PACKS: FontPack[] = [
  { key: "signature", name: "Signature", sub: "Oswald headings, Manrope body — the classic Co-Coachify look", display: "Oswald-Bold" },
  { key: "bold_impact", name: "Bold Impact", sub: "Anton headings for maximum presence", display: "Anton-Regular", premium: true },
  { key: "editorial_mono", name: "Editorial Mono", sub: "Monospace headings for a modern, technical edge", display: "SpaceMono-Regular", premium: true },
];

function applyAccent(a: Accent) {
  colors.brand = a.brand;
  colors.onBrand = a.onBrand;
  colors.brandSecondary = a.secondary;
  colors.brandTertiary = a.tertiary;
  colors.onBrandTertiary = a.onTertiary;
}

function applyFontPack(key: string) {
  const pack = FONT_PACKS.find((p) => p.key === key) ?? FONT_PACKS[0];
  if (pack.key === "signature") {
    fonts.display = "Oswald-SemiBold";
    fonts.displayBold = "Oswald-Bold";
    fonts.displayMedium = "Oswald-Medium";
  } else {
    fonts.display = pack.display;
    fonts.displayBold = pack.display;
    fonts.displayMedium = pack.display;
  }
}

type ThemeContextType = {
  version: number;
  accentColor: string;
  fontPack: string;
  setAccent: (a: Accent) => Promise<void>;
  setFontPack: (key: string) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  const [version, setVersion] = useState(0);
  const [accentColor, setAccentColor] = useState(ACCENTS[0].brand);
  const [fontPack, setFontPackState] = useState(FONT_PACKS[0].key);
  // Tracks the last user-derived (server) values we've already applied, so the
  // sync effect only reacts to REAL server changes (login, refresh) — never to
  // its own optimistic local updates, which would otherwise cause a revert.
  const appliedFromServer = useRef<{ accent?: string | null; font?: string | null }>({});

  useEffect(() => {
    const savedAccent = user?.theme_color ?? null;
    const savedFont = user?.font_pack ?? null;
    if (
      appliedFromServer.current.accent === savedAccent &&
      appliedFromServer.current.font === savedFont
    ) {
      return;
    }
    appliedFromServer.current = { accent: savedAccent, font: savedFont };
    const accent = ACCENTS.find((a) => a.brand === savedAccent) ?? ACCENTS[0];
    applyAccent(accent);
    applyFontPack(savedFont ?? FONT_PACKS[0].key);
    setAccentColor(accent.brand);
    setFontPackState(savedFont ?? FONT_PACKS[0].key);
    setVersion((v) => v + 1);
  }, [user?.theme_color, user?.font_pack]);

  const setAccent = async (a: Accent) => {
    applyAccent(a);
    setAccentColor(a.brand);
    setVersion((v) => v + 1);
    try {
      const updated = await api<{ theme_color: string; font_pack: string | null }>("/me/theme", {
        method: "PUT",
        body: { theme_color: a.brand },
      });
      appliedFromServer.current = { accent: updated.theme_color, font: updated.font_pack };
      updateUser(updated);
    } catch {
      // optimistic UI already applied; next login will resync
    }
  };

  const setFontPack = async (key: string) => {
    applyFontPack(key);
    setFontPackState(key);
    setVersion((v) => v + 1);
    try {
      const updated = await api<{ theme_color: string; font_pack: string | null }>("/me/theme", {
        method: "PUT",
        body: { theme_color: accentColor, font_pack: key },
      });
      appliedFromServer.current = { accent: updated.theme_color, font: updated.font_pack };
      updateUser(updated);
    } catch {
      // optimistic UI already applied; next login will resync
    }
  };

  return (
    <ThemeContext.Provider value={{ version, accentColor, fontPack, setAccent, setFontPack }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
