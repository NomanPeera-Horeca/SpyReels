"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HomepageAuthDialog } from "./HomepageAuthDialog";
import {
  creatorContextFromReturnTo,
  readStashedAuthReturnTo,
  stashAuthReturnTo,
} from "../lib/authHandoffStorage";
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
  const auth = authRaw === "login" || authRaw === "signup" ? authRaw : null;
  const returnToRaw = searchParams.get("returnTo");
  const returnTo = resolveReturnTo(returnToRaw);
  const creator = creatorContextFromReturnTo(returnTo);

  const [open, setOpen] = useState(Boolean(auth));
  const [mode, setMode] = useState<"login" | "signup">(auth ?? "signup");
  const openedForAuthRef = useRef<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    setMode(auth);
    setOpen(true);
    if (returnTo && returnTo !== "/research") stashAuthReturnTo(returnTo);
  }, [auth, returnTo]);

  useEffect(() => {
    if (!open || !auth) return;
    const key = `${auth}:${returnTo}`;
    if (openedForAuthRef.current === key) return;
    openedForAuthRef.current = key;
    trackPublicWeb("auth_dialog_opened", {
      mode: auth,
      return_to: returnTo,
      creator_handle: creator.handle,
      platform: creator.platform,
    });
  }, [auth, open, returnTo, creator.handle, creator.platform]);

  function clearAuthParamKeepReturnTo() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("auth");
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      next.set("returnTo", returnTo);
      stashAuthReturnTo(returnTo);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname || "/", { scroll: false });
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
