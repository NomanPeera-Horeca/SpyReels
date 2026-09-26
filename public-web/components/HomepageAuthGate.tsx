"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HomepageAuthDialog } from "./HomepageAuthDialog";

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

  useEffect(() => {
    if (!auth) return;
    setMode(auth);
    setOpen(true);
  }, [auth]);

  function clearAuthQuery() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("auth");
    next.delete("returnTo");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname || "/", { scroll: false });
  }

  return (
    <HomepageAuthDialog
      open={open}
      defaultMode={mode}
      returnTo={returnTo}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) clearAuthQuery();
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
