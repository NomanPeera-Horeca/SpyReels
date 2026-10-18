export const MOBILE_CREATE_TAB_PATHS = {
  today: "/plan",
  write: "/studio",
  scripts: "/scripts",
  more: "/more",
} as const;

/**
 * Home v2 users only (server HOME_V2_MODE): Home at "/" is the first tab and
 * replaces Today. Everyone else keeps the tabs and routes above, unchanged.
 */
export const MOBILE_CREATE_HOME_PATH = "/";

export type MobileCreateTabId = keyof typeof MOBILE_CREATE_TAB_PATHS | "home";

export type MobileCreateOptions = { homeV2?: boolean };

export function mobileCreateTabForPath(
  pathname: string,
  options: MobileCreateOptions = {}
): MobileCreateTabId {
  if (options.homeV2 && pathname === MOBILE_CREATE_HOME_PATH) return "home";
  // Home v2: the plan is reached from Home ("View plan"), so Home stays lit.
  if (pathname === "/plan") return options.homeV2 ? "home" : "today";
  if (pathname === "/studio") return "write";
  if (pathname.startsWith("/scripts")) return "scripts";
  if (
    pathname === "/more" ||
    pathname === "/settings" ||
    pathname === "/billing" ||
    pathname === "/workspace/settings"
  ) {
    return "more";
  }
  return options.homeV2 ? "home" : "today";
}

/**
 * Paths allowed in mobile create mode. Everything else redirects to Today
 * (Home for Home v2 users, who may also open "/").
 */
export function isMobileCreateAllowedPath(
  pathname: string,
  options: MobileCreateOptions = {}
): boolean {
  if (options.homeV2 && pathname === MOBILE_CREATE_HOME_PATH) return true;
  const allowedPrefixes = [
    "/plan",
    "/studio",
    "/scripts",
    "/more",
    "/settings",
    "/billing",
    "/workspace/settings",
    "/ideas",
    "/onboarding",
    "/invitations/accept",
  ];
  return allowedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
