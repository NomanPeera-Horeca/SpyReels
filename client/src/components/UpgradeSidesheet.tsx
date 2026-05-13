/**
 * UpgradeSidesheet  -  Contextual upgrade prompt UI used across the app.
 *
 * Pattern:
 *   <UpgradeProvider> wraps the app. Any descendant can call
 *   `useFeatureLock("voiceTeleprompter")` to know if a feature is locked.
 *   If locked, render <LockedButton>/<LockedTeaser>/<ProPill> or call
 *   `requireUpgrade()` inside a click handler to open the side sheet.
 *
 * Behavior:
 *   The side sheet slides in from the right with feature-specific value
 *   props and a CTA that sends the user to /pricing. Designed to feel
 *   like a soft nudge, not a hard wall.
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Lock,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUpgradeCheck } from "@/components/UpgradeGate";

export type FeatureKey =
  | "voiceTeleprompter"
  | "smartTakes"
  | "aiCues"
  | "calendar"
  | "kanban"
  | "srtExport"
  | "csvExport"
  | "sheetsExport"
  | "googleDocs"
  | "pdfExport";

const FEATURE_DETAILS: Record<
  FeatureKey,
  {
    title: string;
    tagline: string;
    minPlanLabel: string;
    valueProps: string[];
  }
> = {
  voiceTeleprompter: {
    title: "Voice teleprompter",
    tagline:
      "Read your script hands-free. The teleprompter scrolls in time with your voice so you never lose your place.",
    minPlanLabel: "Pro",
    valueProps: [
      "Hands-free scroll that follows your spoken words",
      "Auto-pause when you stop, auto-resume when you continue",
      "Press V or tap the mic to toggle on the fly",
      "Works with the existing take counter and section bookmarks",
    ],
  },
  smartTakes: {
    title: "Smart take tracking",
    tagline:
      "Track every take, see which sections you keep retrying, and jump straight to the hot spots.",
    minPlanLabel: "Pro",
    valueProps: [
      "Per-take counter so you know exactly how many reshoots happened",
      "Section heatmap shows where you keep getting stuck",
      "Press R to log a retake without leaving teleprompter mode",
      "Take history saves with the script for the next session",
    ],
  },
  aiCues: {
    title: "AI delivery cues",
    tagline:
      "Bracketed coaching notes inside your script - pause here, emphasize this, smile - generated automatically.",
    minPlanLabel: "Pro",
    valueProps: [
      "AI inserts [pause], [emphasize], and tone cues inline",
      "Hover any cue for a coaching note on why it is there",
      "Cues survive every rewrite and export with the script",
      "Toggle on or off per script - your call",
    ],
  },
  calendar: {
    title: "Content calendar",
    tagline:
      "Every script you have written, mapped onto a calendar. Plan a full month of content in one sitting.",
    minPlanLabel: "Solo Creator",
    valueProps: [
      "Month view of every script across your account",
      "Color-coded by status (Idea, Filming, Posted)",
      "See your posting cadence at a glance",
      "Plan a full month of content in one sitting",
    ],
  },
  kanban: {
    title: "Kanban workflow board",
    tagline:
      "Drag scripts through Idea -> Filming -> Posted. See your whole pipeline at a glance.",
    minPlanLabel: "Solo Creator",
    valueProps: [
      "Idea / Filming / Posted columns with drag and drop",
      "Filter by tag or status",
      "See your whole production pipeline in one view",
      "Cuts production chaos when you post 3+ times a week",
    ],
  },
  srtExport: {
    title: "SRT subtitle export",
    tagline:
      "One-click .srt download for any transcript. Drop straight into your editor and burn-in captions.",
    minPlanLabel: "Solo Creator",
    valueProps: [
      "Whisper-grade timestamps already aligned to the audio",
      "Drop into CapCut, Premiere, Final Cut, or DaVinci",
      "Burn-in captions without retyping a word",
      "Compatible with every major editor",
    ],
  },
  csvExport: {
    title: "CSV export",
    tagline:
      "Bulk export research to CSV for your own analysis, client reporting, or backup.",
    minPlanLabel: "Solo Creator",
    valueProps: [
      "All Reels, captions, view counts, and engagement in one CSV",
      "Open in Excel, Numbers, or Google Sheets",
      "Great for weekly reviews and client reporting",
      "Includes hook, transcript, and engagement breakdown columns",
    ],
  },
  sheetsExport: {
    title: "Google Sheets export",
    tagline:
      "Send research directly to a live Google Sheet you can share with editors or clients.",
    minPlanLabel: "Solo Creator",
    valueProps: [
      "Direct push to a new or existing Sheet - no CSV step",
      "Live link you can share with your editors or clients",
      "Re-export to refresh the same sheet with new research",
      "Auto-formatted columns and headers",
    ],
  },
  googleDocs: {
    title: "Google Docs export",
    tagline:
      "Send any script straight to Google Docs. Keep editors, voice talent, and clients in sync.",
    minPlanLabel: "Pro",
    valueProps: [
      "One-click push to a new Doc owned by you",
      "Delivery cues and brackets preserved in the Doc",
      "Share with editors, voice talent, or your team",
      "Universal format for review and approval cycles",
    ],
  },
  pdfExport: {
    title: "PDF and DOCX export",
    tagline:
      "Print-ready PDF or Word file of any script. Perfect for shoot days, client approvals, and offline editing.",
    minPlanLabel: "Pro",
    valueProps: [
      "Print-ready layout with clean typography",
      "Bring it to set on an iPad or paper",
      "Use for client approvals and sign-offs",
      "DOCX format opens in Word, Pages, or any Office editor",
    ],
  },
};

type UpgradeCtx = {
  open: (key: FeatureKey) => void;
  close: () => void;
};

const UpgradeContext = createContext<UpgradeCtx | null>(null);

export function useUpgrade() {
  const ctx = useContext(UpgradeContext);
  if (!ctx) {
    throw new Error("useUpgrade must be used inside <UpgradeProvider>");
  }
  return ctx;
}

/**
 * Convenience hook for gating click handlers.
 * Returns `{ locked, loading, requireUpgrade }`.
 *   - `locked` is true when the current plan does not have access.
 *   - Call `requireUpgrade()` to open the side sheet (no-op if not locked).
 */
export function useFeatureLock(feature: FeatureKey) {
  const { allowed, loading } = useUpgradeCheck(feature);
  const { open } = useUpgrade();

  const locked = !loading && !allowed;
  const requireUpgrade = useCallback(() => {
    if (locked) open(feature);
  }, [locked, open, feature]);

  return { locked, loading, requireUpgrade };
}

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [activeFeature, setActiveFeature] = useState<FeatureKey | null>(null);

  const open = useCallback((key: FeatureKey) => setActiveFeature(key), []);
  const close = useCallback(() => setActiveFeature(null), []);

  return (
    <UpgradeContext.Provider value={{ open, close }}>
      {children}
      <UpgradeSidesheet feature={activeFeature} onClose={close} />
    </UpgradeContext.Provider>
  );
}

function UpgradeSidesheet({
  feature,
  onClose,
}: {
  feature: FeatureKey | null;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const details = feature ? FEATURE_DETAILS[feature] : null;

  return (
    <Sheet
      open={!!feature}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <Badge className="mb-3 bg-primary text-primary-foreground">
              <Crown className="mr-1 h-3 w-3" /> {details?.minPlanLabel}
            </Badge>
            <SheetHeader className="p-0 text-left">
              <SheetTitle className="text-2xl tracking-tight">
                {details?.title}
              </SheetTitle>
              <SheetDescription className="text-base leading-relaxed text-muted-foreground">
                {details?.tagline}
              </SheetDescription>
            </SheetHeader>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-foreground/60">
            What you get
          </p>
          <ul className="space-y-3">
            {details?.valueProps.map(prop => (
              <li key={prop} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm leading-relaxed text-foreground">
                  {prop}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <SheetFooter className="flex-col gap-2 border-t border-border p-6 sm:flex-col sm:space-x-0">
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() => {
              onClose();
              setLocation("/pricing");
            }}
          >
            <Sparkles className="h-4 w-4" />
            Upgrade to {details?.minPlanLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full">
            Maybe later
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Small "Pro" pill badge for inline use beside a label.
 * Renders nothing if the user already has access.
 */
export function ProPill({
  feature,
  className,
}: {
  feature: FeatureKey;
  className?: string;
}) {
  const { allowed, loading } = useUpgradeCheck(feature);
  const details = FEATURE_DETAILS[feature];

  if (loading || allowed) return null;

  return (
    <span
      className={`ml-1.5 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary ${
        className ?? ""
      }`}
    >
      <Lock className="h-2.5 w-2.5" />
      {details.minPlanLabel}
    </span>
  );
}

/**
 * Button-shaped lock. Renders children unchanged when allowed.
 * When locked, renders a muted button with a Pro pill; click opens the sheet.
 */
export function LockedButton({
  feature,
  children,
  className,
}: {
  feature: FeatureKey;
  children: ReactNode;
  className?: string;
}) {
  const { allowed, loading } = useUpgradeCheck(feature);
  const { open } = useUpgrade();
  const details = FEATURE_DETAILS[feature];

  if (loading || allowed) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={() => open(feature)}
      className={`inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary/10 ${
        className ?? ""
      }`}
    >
      <Lock className="h-3.5 w-3.5 text-primary" />
      <span>{children}</span>
      <span className="ml-1 rounded-md border-0 bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
        {details.minPlanLabel}
      </span>
    </button>
  );
}

/**
 * Visual teaser wrapper. Renders the child UI behind a soft blur with a
 * centered "Upgrade to unlock" pill. Click anywhere opens the side sheet.
 * Use this when you want users to SEE what they are missing.
 */
export function LockedTeaser({
  feature,
  children,
  className,
}: {
  feature: FeatureKey;
  children: ReactNode;
  className?: string;
}) {
  const { allowed, loading } = useUpgradeCheck(feature);
  const { open } = useUpgrade();

  if (loading || allowed) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={() => open(feature)}
      className={`relative block w-full text-left ${className ?? ""}`}
    >
      <div className="pointer-events-none select-none opacity-40 blur-[1.5px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-background/90 px-3 py-2 shadow-lg backdrop-blur">
          <Lock className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Upgrade to unlock
          </span>
        </div>
      </div>
    </button>
  );
}
