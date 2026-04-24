import { useState } from "react";
import { X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "lightModeBannerDismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Dismissible heads-up when the user is viewing the app in light mode.
 */
export function LightModeBanner() {
  const { resolvedTheme } = useTheme();
  const [dismissed, setDismissed] = useState(() => readDismissed());

  if (resolvedTheme !== "light" || dismissed) return null;

  return (
    <div
      className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-foreground"
      role="status"
    >
      <div className="mx-auto flex max-w-4xl items-start justify-center gap-3 sm:items-center">
        <p className="flex-1 text-center sm:text-left">
          Light mode is in beta. Some surfaces may look off.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
          aria-label="Dismiss light mode notice"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
