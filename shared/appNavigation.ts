export const APP_NAV_STACK_KEY = "spyreels_app_nav_stack";

export type SetLocationFn = (to: string, options?: { replace?: boolean }) => void;

export function getCurrentAppPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function readNavStack(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(APP_NAV_STACK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function writeNavStack(stack: string[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(APP_NAV_STACK_KEY, JSON.stringify(stack.slice(-40)));
  } catch {
    // ignore quota / private mode
  }
}

/** Track in-app route changes so back buttons can restore the previous screen. */
export function recordAppNavigation(path: string): void {
  const normalized = path.trim() || "/";
  const stack = readNavStack();
  const last = stack[stack.length - 1];

  if (last === normalized) return;

  // Browser back/forward: URL matches the previous stack entry.
  if (stack.length >= 2 && stack[stack.length - 2] === normalized) {
    stack.pop();
    writeNavStack(stack);
    return;
  }

  stack.push(normalized);
  writeNavStack(stack);
}

export function resolveFromParamFallback(from: string | null | undefined): string {
  switch (from) {
    case "history":
      return "/history";
    case "dashboard":
      return "/dashboard";
    case "discover-creators":
      return "/discover-creators";
    case "research":
      return "/research";
    case "plan":
      return "/plan";
    case "studio":
      return "/studio";
    case "scripts":
      return "/scripts";
    case "library":
      return "/library";
    case "collected":
      return "/collected";
    case "ideas":
      return "/ideas";
    default:
      return "/research";
  }
}

/**
 * SaaS-style back: restore the previous in-app route when possible,
 * otherwise use a safe fallback (never a random dashboard redirect).
 */
export function navigateAppBack(setLocation: SetLocationFn, fallback: string): void {
  const current = getCurrentAppPath();
  const stack = readNavStack();

  if (stack.length === 0 || stack[stack.length - 1] !== current) {
    stack.push(current);
  }

  if (stack.length >= 2) {
    stack.pop();
    const target = stack[stack.length - 1];
    writeNavStack(stack);
    if (target && target !== current) {
      setLocation(target, { replace: true });
      return;
    }
  }

  if (typeof window !== "undefined" && window.history.length > 1) {
    window.history.back();
    return;
  }

  setLocation(fallback, { replace: true });
}

/** Use replace for gate redirects and transient loading screens. */
export function navigateAppReplace(setLocation: SetLocationFn, path: string): void {
  setLocation(path, { replace: true });
}
