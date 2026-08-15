export const MOBILE_CREATE_TAB_PATHS = {
  today: "/plan",
  write: "/studio",
  scripts: "/scripts",
  more: "/more",
} as const;

export type MobileCreateTabId = keyof typeof MOBILE_CREATE_TAB_PATHS;

export function mobileCreateTabForPath(pathname: string): MobileCreateTabId {
  if (pathname === "/plan") return "today";
  if (pathname === "/studio" || pathname === "/ai-studio") return "write";
  if (pathname.startsWith("/scripts")) return "scripts";
  if (
    pathname === "/more" ||
    pathname === "/settings" ||
    pathname === "/billing" ||
    pathname === "/workspace/settings"
  ) {
    return "more";
  }
  return "today";
}

/** Paths allowed in mobile create mode. Everything else redirects to Today. */
export function isMobileCreateAllowedPath(pathname: string): boolean {
  const allowedPrefixes = [
    "/plan",
    "/studio",
    "/ai-studio",
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
