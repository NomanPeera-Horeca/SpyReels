import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import ExportJobTracker from "@/components/ExportJobTracker";
import { ActiveScrapeJobNotice } from "@/components/ActiveScrapeJobNotice";
import { useActiveScrapeJob } from "@/lib/activeScrapeJob";
import { useScrapeCompletionNotifier } from "@/hooks/useScrapeCompletionNotifier";
import { useActivityHeartbeat } from "@/hooks/useActivityHeartbeat";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Bookmark,
  FileText,
  Settings,
  CreditCard,
  Inbox,
  Lightbulb,
  CalendarDays,
  Sparkles,
  Library,
  Search,
  ClipboardPaste,
  Compass,
  Shield,
  Radar,
  Sun,
  Users,
} from "lucide-react";
import LandingPage from "@/pages/LandingPage";
import { CSSProperties, Fragment, useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import Tooltip from "@/components/Tooltip";
import { SpyReelsWordmark } from "@/components/SpyReelsWordmark";
import { CreateWorkspaceModal } from "@/components/CreateWorkspaceModal";
import { SendToWorkspaceModal } from "@/components/SendToWorkspaceModal";
import { ShareLinkModal } from "@/components/ShareLinkModal";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Button } from "./ui/button";
import {
  type ThemePreference,
  useTheme,
} from "@/contexts/ThemeContext";
import { isDiscoveryV1Enabled } from "@/lib/featureFlags";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { getCurrentAppPath, recordAppNavigation } from "@shared/appNavigation";
import { resolvePrimaryNicheLabel } from "@shared/primaryNiche";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const adminMenuItems = [{ icon: Shield, label: "Admin", path: "/admin" }];

/** Verbatim `data-tip` strings from docs/build-spec/spyreels-research-mockup-v2-2.html sidebar nav */
const SIDEBAR_NAV_TOOLTIPS: Partial<Record<string, string>> = {
  "/dashboard": "See past research results and saved reel data",
  "/discovery": "Describe your niche, find viral reels in your niche",
  "/discover-creators":
    "Describe your niche, find peer creators worth studying and remaking",
  "/research": "Spy on any public Instagram creator",
  "/collected": "Individual reels you've saved from past research",
  "/history":
    "Creator Radar: live reel stats from each spy session. Refresh pulls new posts since last sync (fresh window, not a full backfill).",
  "/scripts": "Your AI-generated scripts library",
  "/ideas": "Turn a rough idea into a viral-ready script",
  "/plan": "30-day content calendar with AI-generated ideas",
  "/studio": "AI Coach for viral Reel scripts",
  "/library":
    "Saved reel transcripts and scripts (from research, collects, and the script tools)",
  "/saved": "Reels you bookmarked for later",
  "/interests":
    "Niches and creators for sidebar recommendations and the /research feed",
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

type SidebarNavItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  badge?: "new";
  featured?: boolean;
};

type SidebarNavSection = {
  id: string;
  label: string;
  items: SidebarNavItem[];
};

function buildNavSections(): SidebarNavSection[] {
  return [
    {
      id: "create",
      label: "Create",
      items: [
        { icon: Sparkles, label: "AI Coach", path: "/studio", badge: "new", featured: true },
        { icon: CalendarDays, label: "30-Day Plan", path: "/plan" },
        { icon: Lightbulb, label: "Idea to Script", path: "/ideas" },
        { icon: FileText, label: "My Scripts", path: "/scripts" },
        { icon: Library, label: "Transcripts & Scripts", path: "/library" },
        { icon: ClipboardPaste, label: "Paste Script", path: "/paste" },
      ],
    },
    {
      id: "discover",
      label: "Discover",
      items: [
        ...(isDiscoveryV1Enabled
          ? [
              { icon: Compass, label: "Discovery", path: "/discovery" as const },
              {
                icon: Users,
                label: "Discover Creators",
                path: "/discover-creators" as const,
              },
            ]
          : []),
        { icon: Search, label: "Spy Viral Reels", path: "/research" },
        { icon: Inbox, label: "Collected Reels", path: "/collected" },
        { icon: Radar, label: "Creator Radar", path: "/history" },
        { icon: Bookmark, label: "Saved Reels", path: "/saved" },
      ],
    },
    {
      id: "overview",
      label: "Overview",
      items: [{ icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" }],
    },
    {
      id: "account",
      label: "Account",
      items: [
        { icon: Settings, label: "Settings", path: "/settings" },
        { icon: CreditCard, label: "Billing", path: "/billing" },
      ],
    },
  ];
}

function isSidebarPathActive(location: string, path: string): boolean {
  if (path === "/research") {
    return location === "/research" || location === "/";
  }
  if (path === "/scripts") {
    return location === "/scripts" || location.startsWith("/scripts/");
  }
  if (path === "/admin") {
    return location === "/admin" || location.startsWith("/admin/");
  }
  return location === path;
}

function SidebarNicheCard({
  nicheLabel,
  targetAudience,
}: {
  nicheLabel: string;
  targetAudience: string | null;
}) {
  return (
    <div className="mx-2 mb-2 rounded-xl border border-sidebar-border bg-background px-3 py-2.5 group-data-[collapsible=icon]:hidden">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Your niche
      </p>
      <p className="text-sm font-semibold leading-tight text-foreground">{nicheLabel}</p>
      {targetAudience ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{targetAudience}</p>
      ) : null}
    </div>
  );
}

function NavBadge({ active, kind }: { active: boolean; kind: "new" }) {
  if (kind !== "new") return null;
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground"
      )}
    >
      NEW
    </span>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return <LandingPage />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  useActivityHeartbeat(Boolean(user));
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { activeJob: activeRunningJob } = useActiveScrapeJob();
  useScrapeCompletionNotifier();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { themePreference, setThemePreference, switchable } = useTheme();
  const navSections = buildNavSections();
  const flatNavItems = navSections.flatMap((section) => section.items);

  const onboardingStateQuery = trpc.onboarding.getState.useQuery(undefined, {
    staleTime: 60_000,
  });

  const nicheLabel = resolvePrimaryNicheLabel({
    businessDescription: onboardingStateQuery.data?.businessDescription,
    targetAudience: onboardingStateQuery.data?.targetAudience,
    selectedNicheSlugs: onboardingStateQuery.data?.selectedNicheSlugs,
  });

  const targetAudience = onboardingStateQuery.data?.targetAudience?.trim() || null;

  const activeMenuItem =
    flatNavItems.find((item) => isSidebarPathActive(location, item.path)) ??
    adminMenuItems.find((item) => isSidebarPathActive(location, item.path));

  useEffect(() => {
    recordAppNavigation(getCurrentAppPath());
  }, [location, searchString]);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <CreateWorkspaceModal />
      <SendToWorkspaceModal />
      <ShareLinkModal />
      {user ? <ExportJobTracker /> : null}
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <WorkspaceSwitcher />
          {activeRunningJob ? (
            <ActiveScrapeJobNotice job={activeRunningJob} variant="sidebar" />
          ) : null}
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                {isCollapsed ? (
                  <img
                    src="https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png"
                    alt="SpyReels"
                    className="h-6 w-6"
                  />
                ) : (
                  <PanelLeft className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {!isCollapsed ? <SpyReelsWordmark /> : null}
            </div>
          </SidebarHeader>

          {!isCollapsed ? (
            <SidebarNicheCard nicheLabel={nicheLabel} targetAudience={targetAudience} />
          ) : null}

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {navSections.map((section) => (
                <Fragment key={section.id}>
                  <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider group-data-[collapsible=icon]:hidden">
                    {section.label}
                  </div>
                  {section.items.map((item) => {
                    const isActive = isSidebarPathActive(location, item.path);
                    const mockupTooltip = SIDEBAR_NAV_TOOLTIPS[item.path];
                    const button = (
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => {
                          if (!isActive) setLocation(item.path);
                        }}
                        tooltip={mockupTooltip ? undefined : item.label}
                        className={cn(
                          "h-10 transition-all font-normal",
                          isActive &&
                            "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground [&>svg]:text-primary-foreground",
                          !isActive &&
                            item.featured &&
                            "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary data-[active=true]:bg-primary/10"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                        {item.badge ? <NavBadge active={isActive} kind={item.badge} /> : null}
                      </SidebarMenuButton>
                    );

                    return (
                      <SidebarMenuItem key={item.path}>
                        {mockupTooltip ? (
                          <Tooltip content={mockupTooltip} side="right">
                            {button}
                          </Tooltip>
                        ) : (
                          button
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </Fragment>
              ))}
              {user?.email === import.meta.env.VITE_ADMIN_EMAIL ? (
                <>
                  <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider group-data-[collapsible=icon]:hidden">
                    Admin
                  </div>
                  {adminMenuItems.map((item) => {
                    const isActive = isSidebarPathActive(location, item.path);
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => {
                            if (!isActive) setLocation(item.path);
                          }}
                          tooltip={item.label}
                          className={cn(
                            "h-10 transition-all font-normal",
                            isActive &&
                              "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground [&>svg]:text-primary-foreground"
                          )}
                        >
                          <item.icon className={`h-4 w-4 ${isActive ? "" : "text-purple-400"}`} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </>
              ) : null}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-foreground">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {switchable ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Sun className="mr-2 h-4 w-4" />
                      Appearance
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44">
                      <DropdownMenuRadioGroup
                        value={themePreference}
                        onValueChange={(v: string) =>
                          setThemePreference(v as ThemePreference)
                        }
                      >
                        <DropdownMenuRadioItem value="system">
                          Use system setting
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="light">Light (beta)</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dark">
                          Dark
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                {switchable ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  onClick={() => {
                    void logout();
                  }}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="sticky top-0 z-40 flex min-h-mobile-header items-center justify-between border-b bg-background/95 px-2 pt-safe backdrop-blur supports-[backdrop-filter]:backdrop-blur">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 pb-safe-main px-safe md:p-6 md:pb-6">
          <PwaInstallBanner />
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
