import { useAuth } from "@/_core/hooks/useAuth";
import ExportJobTracker from "@/components/ExportJobTracker";
import LandingPage from "@/pages/LandingPage";
import { MobileAppLayoutSkeleton } from "@/components/MobileAppLayoutSkeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { getCurrentAppPath, recordAppNavigation } from "@shared/appNavigation";
import { resolvePrimaryNicheLabel } from "@shared/primaryNiche";
import {
  MOBILE_CREATE_TAB_PATHS,
  mobileCreateTabForPath,
  type MobileCreateTabId,
} from "@shared/mobileCreateApp";
import {
  CalendarDays,
  FileText,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";

const TABS: Array<{
  id: MobileCreateTabId;
  label: string;
  path: string;
  icon: typeof Sparkles;
}> = [
  { id: "today", label: "Today", path: MOBILE_CREATE_TAB_PATHS.today, icon: CalendarDays },
  { id: "write", label: "AI Coach", path: MOBILE_CREATE_TAB_PATHS.write, icon: Sparkles },
  { id: "scripts", label: "Scripts", path: MOBILE_CREATE_TAB_PATHS.scripts, icon: FileText },
  { id: "more", label: "More", path: MOBILE_CREATE_TAB_PATHS.more, icon: MoreHorizontal },
];

function MobileNicheBar({
  nicheLabel,
  targetAudience,
}: {
  nicheLabel: string;
  targetAudience: string | null;
}) {
  return (
    <div className="border-b border-border/60 bg-card/80 px-4 py-2.5 pt-safe backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Your niche
      </p>
      <p className="text-sm font-semibold leading-tight text-foreground">{nicheLabel}</p>
      {targetAudience ? (
        <p className="line-clamp-1 text-xs text-muted-foreground">{targetAudience}</p>
      ) : null}
    </div>
  );
}

function MobileTabBar({
  activeTab,
}: {
  activeTab: MobileCreateTabId;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 mobile-tab-bar"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-lg items-stretch px-1 pt-1">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-sm" : ""
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function MobileAppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return <MobileAppLayoutSkeleton />;
  }

  if (!user) {
    return <LandingPage />;
  }

  return (
    <>
      {user ? <ExportJobTracker /> : null}
      <MobileAppLayoutShell>{children}</MobileAppLayoutShell>
    </>
  );
}

function MobileAppLayoutShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const searchString = useSearch();
  const activeTab = mobileCreateTabForPath(location);
  const isScriptDetail =
    location.startsWith("/scripts/") && location !== "/scripts";

  const onboardingStateQuery = trpc.onboarding.getState.useQuery(undefined, {
    staleTime: 60_000,
  });

  const nicheLabel = resolvePrimaryNicheLabel({
    businessDescription: onboardingStateQuery.data?.businessDescription,
    targetAudience: onboardingStateQuery.data?.targetAudience,
    selectedNicheSlugs: onboardingStateQuery.data?.selectedNicheSlugs,
  });

  const targetAudience = onboardingStateQuery.data?.targetAudience?.trim() || null;

  useEffect(() => {
    recordAppNavigation(getCurrentAppPath());
  }, [location, searchString]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <MobileNicheBar nicheLabel={nicheLabel} targetAudience={targetAudience} />
      <main className="flex-1 overflow-x-hidden overflow-y-auto px-safe pb-mobile-tabs pt-3">
        <div
          className={cn(
            "mx-auto w-full",
            isScriptDetail ? "max-w-none px-0" : "max-w-lg px-4"
          )}
        >
          {children}
        </div>
      </main>
      <MobileTabBar activeTab={activeTab} />
    </div>
  );
}
