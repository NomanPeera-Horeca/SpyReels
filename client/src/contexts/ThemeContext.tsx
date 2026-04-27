import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  /** @deprecated use resolvedTheme */
  theme: ResolvedTheme;
  setThemePreference: (t: ThemePreference) => void;
  cycleThemePreference: () => void;
  /** @deprecated use cycleThemePreference */
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === "light" || s === "dark" || s === "system") return s;
  } catch {
    /* ignore */
  }
  return "system";
}

function resolvePreference(
  pref: ThemePreference,
  systemIsDark: boolean
): ResolvedTheme {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return systemIsDark ? "dark" : "light";
}

function applyDomTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  switchable = false,
}: ThemeProviderProps) {
  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    () => (switchable ? readStoredPreference() : defaultTheme)
  );

  const activePreference: ThemePreference = switchable
    ? themePreference
    : defaultTheme;

  const resolvedTheme = useMemo(
    () => resolvePreference(activePreference, systemIsDark),
    [activePreference, systemIsDark]
  );

  useEffect(() => {
    applyDomTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (!switchable) return;
    try {
      localStorage.setItem(STORAGE_KEY, themePreference);
    } catch {
      /* ignore */
    }
  }, [themePreference, switchable]);

  useEffect(() => {
    if (typeof window === "undefined" || activePreference !== "system")
      return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemIsDark(mq.matches);
    mq.addEventListener("change", handler);
    setSystemIsDark(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, [activePreference]);

  const setThemePreference = useCallback(
    (t: ThemePreference) => {
      if (!switchable) return;
      setThemePreferenceState(t);
      if (t === "system" && typeof window !== "undefined") {
        setSystemIsDark(
          window.matchMedia("(prefers-color-scheme: dark)").matches
        );
      }
    },
    [switchable]
  );

  const cycleThemePreference = useCallback(() => {
    if (!switchable) return;
    setThemePreferenceState((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
      if (typeof window !== "undefined") {
        setSystemIsDark(
          window.matchMedia("(prefers-color-scheme: dark)").matches
        );
      }
      return "system";
    });
  }, [switchable]);

  const value: ThemeContextType = {
    themePreference: activePreference,
    resolvedTheme,
    theme: resolvedTheme,
    setThemePreference,
    cycleThemePreference,
    toggleTheme: switchable ? cycleThemePreference : undefined,
    switchable,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
