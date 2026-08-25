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
  { name: "Neon Green", brand: "#34E27A", onBrand: "#06130B", secondary: "#7CF5AC", tertiary: "#0E2A1A", onTertiary: "#A8F5C8" },
  { name: "Teal", brand: "#2DD4BF", onBrand: "#06211D", secondary: "#7EEADD", tertiary: "#0B2723", onTertiary: "#A5F0E6" },
  { name: "Coral", brand: "#FF4B3A", onBrand: "#FFFFFF", secondary: "#FF7B6E", tertiary: "#3A1512", onTertiary: "#FFBDB8" },
  { name: "Purple", brand: "#A78BFA", onBrand: "#160E2E", secondary: "#C4B0FF", tertiary: "#1D1533", onTertiary: "#D8CCFF" },
  { name: "Gold", brand: "#FBBF24", onBrand: "#211703", secondary: "#FDD97C", tertiary: "#2A2208", onTertiary: "#FDE6A8" },
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
