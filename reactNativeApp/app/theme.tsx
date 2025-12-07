import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import * as SystemUI from "expo-system-ui";

export type AppTheme = {
  mode: "light" | "dark";
  colors: {
    background: string;
    surface: string;
    card: string;
    text: string;
    muted: string;
    accent: string;
    border: string;
    shadow: string;
  };
  toggle: () => void;
};

const vscodeDark = {
  background: "#1e1e1e",
  surface: "#252526",
  card: "#2d2d30",
  text: "#d4d4d4",
  muted: "#9da5b4",
  accent: "#569cd6",
  border: "#3c3c3c",
  shadow: "#00000050",
};

const lightTheme = {
  background: "#f7f7f7",
  surface: "#ffffff",
  card: "#f0f0f3",
  text: "#1f1f1f",
  muted: "#4a4a4a",
  accent: "#0066cc",
  border: "#dcdcdc",
  shadow: "#0f172a15",
};

const ThemeContext = createContext<AppTheme>({
  mode: "dark",
  colors: vscodeDark,
  toggle: () => {},
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<"light" | "dark">("dark");

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(
      mode === "dark" ? vscodeDark.background : lightTheme.background
    );
  }, [mode]);

  const value = useMemo<AppTheme>(() => {
    const colors = mode === "dark" ? vscodeDark : lightTheme;
    return {
      mode,
      colors,
      toggle: () => setMode((prev) => (prev === "dark" ? "light" : "dark")),
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => useContext(ThemeContext);
