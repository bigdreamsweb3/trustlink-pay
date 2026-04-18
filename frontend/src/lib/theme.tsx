"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  hydrated: boolean;
};

const STORAGE_KEY = "trustlink-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function readStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

function getPreferredTheme(): ThemeMode {
  const stored = readStoredTheme();
  if (stored) {
    return stored;
  }

  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initialTheme = getPreferredTheme();
    setThemeState(initialTheme);
    applyTheme(initialTheme);
    setHydrated(true);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      hydrated,
      setTheme: (nextTheme) => {
        setThemeState(nextTheme);
        applyTheme(nextTheme);
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
      },
      toggleTheme: () => {
        const nextTheme = theme === "dark" ? "light" : "dark";
        setThemeState(nextTheme);
        applyTheme(nextTheme);
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
      },
    }),
    [hydrated, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
