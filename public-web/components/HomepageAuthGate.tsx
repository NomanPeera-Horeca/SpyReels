"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HomepageAuthDialog } from "./HomepageAuthDialog";
import {
  creatorContextFromReturnTo,
  readStashedAuthReturnTo,
  stashAuthReturnTo,
} from "../lib/authHandoffStorage";
import { subscribeHomepageAuthOpen } from "../lib/openHomepageAuth";
import {
  trackPublicWeb,
  type AuthDialogDismissReason,
} from "../lib/trackPublicWeb";

function resolveReturnTo(urlReturnTo: string | null): string {
  const stashed = readStashedAuthReturnTo();
  const urlHasCreator = Boolean(creatorContextFromReturnTo(urlReturnTo).handle);
  const stashHasCreator = Boolean(creatorContextFromReturnTo(stashed).handle);

  if (urlHasCreator && urlReturnTo) return urlReturnTo;
  if (stashHasCreator && stashed) return stashed;
  if (urlReturnTo && urlReturnTo.startsWith("/") && !urlReturnTo.startsWith("//")) {
    return urlReturnTo;
  }
  if (stashed) return stashed;
  return "/research";
}

function HomepageAuthGateInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const authRaw = searchParams.get("auth");
  const authFromUrl = authRaw === "login" || authRaw === "signup" ? authRaw : null;
  const returnToRaw = searchParams.get("returnTo");

  const [open, setOpen] = useState(Boolean(authFromUrl));
  const [mode, setMode] = useState<"login" | "signup">(authFromUrl ?? "signup");
  const [returnTo, setReturnTo] = useState(() => resolveReturnTo(returnToRaw));
  const openedForAuthRef = useRef<string | null>(null);

  const creator = creatorContextFromReturnTo(returnTo);

  useEffect(() => {
    return subscribeHomepageAuthOpen((detail) => {
      setMode(detail.mode);
      setReturnTo(detail.returnTo);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!authFromUrl) return;
    setMode(authFromUrl);
    const resolved = resolveReturnTo(returnToRaw);
    setReturnTo(resolved);
    setOpen(true);
    if (resolved && resolved !== "/research") stashAuthReturnTo(resolved);
  }, [authFromUrl, returnToRaw]);

  useEffect(() => {
    if (!open) return;
    const key = `${mode}:${returnTo}`;
    if (openedForAuthRef.current === key) return;
    openedForAuthRef.current = key;
    trackPublicWeb("auth_dialog_opened", {
      mode,
      return_to: returnTo,
      creator_handle: creator.handle,
      platform: creator.platform,
    });
  }, [open, mode, returnTo, creator.handle, creator.platform]);

  function clearAuthParamKeepReturnTo() {
    const next = new URLSearchParams(
      typeof window !== "undefined"
        ? window.location.search
        : searchParams.toString()
    );
    next.delete("auth");
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      next.set("returnTo", returnTo);
      stashAuthReturnTo(returnTo);
    }
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname || "/";
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", href);
    }
    router.replace(href, { scroll: false });
  }

  function dismiss(reason: AuthDialogDismissReason) {
    trackPublicWeb("auth_dialog_dismissed", {
      mode,
      return_to: returnTo,
      dismiss_reason: reason,
      creator_handle: creator.handle,
      platform: creator.platform,
    });
    openedForAuthRef.current = null;
    setOpen(false);
    clearAuthParamKeepReturnTo();
  }

  return (
    <HomepageAuthDialog
      open={open}
      defaultMode={mode}
      returnTo={returnTo}
      creatorHandle={creator.handle}
      creatorPlatform={creator.platform}
      onOpenChange={(nextOpen, meta) => {
        if (!nextOpen) {
          dismiss(meta?.reason ?? "x");
          return;
        }
        setOpen(true);
      }}
    />
  );
}

export function HomepageAuthGate() {
  return (
    <Suspense fallback={null}>
      <HomepageAuthGateInner />
    </Suspense>
  );
}
