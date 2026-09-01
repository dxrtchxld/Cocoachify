import React, { createContext, useContext, useEffect, useState } from "react";

import { useAuth } from "./AuthContext";
import { api } from "../lib/api";
import { colors } from "../theme";

export type Accent = {
  name: string;
  brand: string;
  onBrand: string;
  secondary: string;
  tertiary: string;
  onTertiary: string;
};

export const ACCENTS: Accent[] = [
  { name: "Champagne", brand: "#E5D0A1", onBrand: "#0A0A0A", secondary: "#B39D73", tertiary: "#2A261C", onTertiary: "#E5D0A1" },
  { name: "Platinum", brand: "#E7E7EA", onBrand: "#0A0A0A", secondary: "#A1A1AA", tertiary: "#242427", onTertiary: "#E7E7EA" },
  { name: "Emerald", brand: "#34E27A", onBrand: "#06130B", secondary: "#7CF5AC", tertiary: "#0E2A1A", onTertiary: "#A8F5C8" },
  { name: "Sky", brand: "#8EC5FF", onBrand: "#04121F", secondary: "#BFDCFF", tertiary: "#111E2A", onTertiary: "#D6E9FF" },
  { name: "Coral", brand: "#FF6F61", onBrand: "#1F0704", secondary: "#FF9C91", tertiary: "#2A1512", onTertiary: "#FFC7C0" },
  { name: "Violet", brand: "#C4B0FF", onBrand: "#160E2E", secondary: "#D8CCFF", tertiary: "#1D1533", onTertiary: "#E7DEFF" },
  { name: "Rose", brand: "#F5A3C7", onBrand: "#2A0E1A", secondary: "#F9C3DA", tertiary: "#2E1621", onTertiary: "#FCD9E8" },
];

function applyAccent(a: Accent) {
  colors.brand = a.brand;
  colors.onBrand = a.onBrand;
  colors.brandSecondary = a.secondary;
  colors.brandTertiary = a.tertiary;
  colors.onBrandTertiary = a.onTertiary;
}

type ThemeContextType = {
  version: number;
  accentColor: string;
  setAccent: (a: Accent) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  const [accentColor, setAccentColor] = useState(ACCENTS[0].brand);

  useEffect(() => {
    const saved = user?.theme_color;
    const accent = ACCENTS.find((a) => a.brand === saved) ?? ACCENTS[0];
    if (accent.brand !== accentColor) {
      applyAccent(accent);
      setAccentColor(accent.brand);
      setVersion((v) => v + 1);
    }
  }, [user?.theme_color, accentColor]);

  const setAccent = async (a: Accent) => {
    applyAccent(a);
    setAccentColor(a.brand);
    setVersion((v) => v + 1);
    try {
      await api("/me/theme", { method: "PUT", body: { theme_color: a.brand } });
    } catch {
      // persisted next time
    }
  };

  return (
    <ThemeContext.Provider value={{ version, accentColor, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
