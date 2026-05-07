import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
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
  if (resolved === "dark") {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

function subscribeSystemColorScheme(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSystemIsDarkSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getSystemIsDarkServerSnapshot(): boolean {
  return false;
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
  /** Live OS dark-mode flag; useSyncExternalStore stays aligned with `prefers-color-scheme` (and fixes missed updates). */
  const systemIsDark = useSyncExternalStore(
    subscribeSystemColorScheme,
    getSystemIsDarkSnapshot,
    getSystemIsDarkServerSnapshot
  );

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

  useLayoutEffect(() => {
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

  const setThemePreference = useCallback(
    (t: ThemePreference) => {
      if (!switchable) return;
      setThemePreferenceState(t);
    },
    [switchable]
  );

  const cycleThemePreference = useCallback(() => {
    if (!switchable) return;
    setThemePreferenceState((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
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
