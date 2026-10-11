import { stashAuthReturnTo } from "./authHandoffStorage";

export type HomepageAuthOpenDetail = {
  mode: "login" | "signup";
  returnTo: string;
};

type Listener = (detail: HomepageAuthOpenDetail) => void;

const listeners = new Set<Listener>();

export function subscribeHomepageAuthOpen(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Soft-open auth without a Next navigation (keeps finder React state mounted). */
export function openHomepageAuth(detail: HomepageAuthOpenDetail): void {
  const returnTo =
    detail.returnTo.startsWith("/") && !detail.returnTo.startsWith("//")
      ? detail.returnTo
      : "/research";
  stashAuthReturnTo(returnTo);

  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.set("auth", detail.mode);
    url.searchParams.set("returnTo", returnTo);
    window.history.pushState(window.history.state, "", url.toString());
  }

  for (const listener of listeners) {
    listener({ mode: detail.mode, returnTo });
  }
}
