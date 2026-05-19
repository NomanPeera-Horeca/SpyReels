import { useEffect } from "react";

const BASE_URL = "https://spyreels.ai";

function resolvePath(path?: string): string {
  if (path !== undefined) {
    return path === "" || path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`;
  }
  if (typeof window !== "undefined") {
    return window.location.pathname || "/";
  }
  return "/";
}

function toCanonicalHref(pathname: string): string {
  if (pathname === "/") {
    return `${BASE_URL}/`;
  }
  return `${BASE_URL}${pathname}`;
}

/**
 * Injects `<link rel="canonical">` for the current page and removes it on unmount.
 * @param path - e.g. `/pricing`. Defaults to `window.location.pathname` when omitted.
 */
export function useCanonical(path?: string) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const pathname = resolvePath(path);
    const href = toCanonicalHref(pathname);

    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = href;
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, [path]);
}
