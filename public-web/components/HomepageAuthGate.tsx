"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HomepageAuthDialog } from "./HomepageAuthDialog";
import {
  trackPublicWeb,
  type AuthDialogDismissReason,
} from "../lib/trackPublicWeb";

function HomepageAuthGateInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const authRaw = searchParams.get("auth");
  const auth = authRaw === "login" || authRaw === "signup" ? authRaw : null;
  const returnToRaw = searchParams.get("returnTo");
  const returnTo =
    returnToRaw && returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")
      ? returnToRaw
      : "/research";

  const [open, setOpen] = useState(Boolean(auth));
  const [mode, setMode] = useState<"login" | "signup">(auth ?? "signup");
  const openedForAuthRef = useRef<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    setMode(auth);
    setOpen(true);
  }, [auth]);

  useEffect(() => {
    if (!open || !auth) return;
    const key = `${auth}:${returnTo}`;
    if (openedForAuthRef.current === key) return;
    openedForAuthRef.current = key;
    trackPublicWeb("auth_dialog_opened", {
      mode: auth,
      return_to: returnTo,
    });
  }, [auth, open, returnTo]);

  function clearAuthQuery() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("auth");
    next.delete("returnTo");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname || "/", { scroll: false });
  }

  function dismiss(reason: AuthDialogDismissReason) {
    trackPublicWeb("auth_dialog_dismissed", {
      mode,
      return_to: returnTo,
      dismiss_reason: reason,
    });
    openedForAuthRef.current = null;
    setOpen(false);
    clearAuthQuery();
  }

  return (
    <HomepageAuthDialog
      open={open}
      defaultMode={mode}
      returnTo={returnTo}
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
