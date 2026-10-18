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
import { trpc } from "@/lib/trpc";

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

const getInitialTheme = (): ResolvedTheme => {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  if (window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "dark";
};

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === "light" || s === "dark" || s === "system") return s;
  } catch {
    /* ignore */
  }
  return "dark";
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
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  if (resolved === "dark") {
    root.style.colorScheme = "dark";
  } else {
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
  if (typeof window === "undefined") return getInitialTheme() === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getSystemIsDarkServerSnapshot(): boolean {
  return getInitialTheme() === "dark";
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

  // Account theme (user_preferences.theme). Null means "never chosen": legacy
  // accounts keep the existing local behavior. Signed-out visitors use local only.
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const signedIn = Boolean(meQuery.data);
  const prefsQuery = trpc.preferences.get.useQuery(undefined, {
    enabled: signedIn && switchable,
    refetchOnWindowFocus: false,
  });
  const saveTheme = trpc.preferences.update.useMutation();
  const accountTheme = prefsQuery.data?.theme ?? null;

  // Reveal the page once the theme is known: signed-out visitors immediately,
  // signed-in users after their saved preference (or an error) has resolved.
  useLayoutEffect(() => {
    const settled = !meQuery.isLoading && (!signedIn || !prefsQuery.isLoading);
    if (settled) document.documentElement.classList.remove("theme-pending");
  }, [meQuery.isLoading, signedIn, prefsQuery.isLoading]);

  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    () => (switchable ? readStoredPreference() : defaultTheme)
  );

  // Once the account's saved theme arrives, it wins on every device.
  useEffect(() => {
    if (!switchable) return;
    if (accountTheme !== "light" && accountTheme !== "dark" && accountTheme !== "system") return;
    setThemePreferenceState(prev => (prev === accountTheme ? prev : accountTheme));
  }, [accountTheme, switchable]);

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

  /** Explicit user choice: apply now, remember locally, and save to the account when signed in. */
  const setThemePreference = useCallback(
    (t: ThemePreference) => {
      if (!switchable) return;
      setThemePreferenceState(t);
      if (signedIn) {
        saveTheme.mutate({ theme: t });
      }
    },
    // saveTheme is a stable mutation object per render; signedIn/switchable gate the save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [switchable, signedIn]
  );

  const cycleThemePreference = useCallback(() => {
    if (!switchable) return;
    const next: ThemePreference =
      themePreference === "system" ? "light" : themePreference === "light" ? "dark" : "system";
    setThemePreference(next);
  }, [switchable, themePreference, setThemePreference]);

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
