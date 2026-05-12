import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { usePostHog } from "@posthog/react";
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
  Library,
  Search,
  ClipboardPaste,
  Shield,
  Radar,
  Sun,
} from "lucide-react";
import LandingPage from "@/pages/LandingPage";
import { CSSProperties, Fragment, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import Tooltip from "@/components/Tooltip";
import { SpyReelsWordmark } from "@/components/SpyReelsWordmark";
import { Button } from "./ui/button";
import {
  type ThemePreference,
  useTheme,
} from "@/contexts/ThemeContext";

const adminMenuItems = [{ icon: Shield, label: "Admin", path: "/admin" }];

/** Verbatim `data-tip` strings from docs/build-spec/spyreels-research-mockup-v2-2.html sidebar nav */
const SIDEBAR_NAV_TOOLTIPS: Partial<Record<string, string>> = {
  "/dashboard": "See past research results and saved reel data",
  "/research": "Spy on any public Instagram creator",
  "/collected": "Individual reels you've saved from past research",
  "/history":
    "Creator Radar: live reel stats from each spy session. Refresh pulls new posts since last sync (fresh window, not a full backfill).",
  "/scripts": "Your AI-generated scripts library",
  "/ideas": "Turn a rough idea into a viral-ready script",
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
  const posthog = usePostHog();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { themePreference, setThemePreference, switchable } = useTheme();

  useEffect(() => {
    if (user) {
      posthog?.identify(String(user.id), {
        email: user.email,
        name: user.name,
      });
    }
  }, [posthog, user?.id, user?.email, user?.name]);
  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Search, label: "Spy Viral Reels", path: "/research" },
    { icon: Inbox, label: "Collected Reels", path: "/collected" },
    { icon: Radar, label: "Creator Radar", path: "/history" },
    { icon: FileText, label: "My Scripts", path: "/scripts" },
    { icon: Lightbulb, label: "Idea to Script", path: "/ideas" },
    { icon: Library, label: "Transcripts & Scripts", path: "/library" },
    { icon: Bookmark, label: "Saved Reels", path: "/saved" },
    { icon: ClipboardPaste, label: "Paste Script", path: "/paste" },
    { icon: Settings, label: "Settings", path: "/settings" },
    { icon: CreditCard, label: "Billing", path: "/billing" },
  ];
  const activeMenuItem = menuItems.find(item => item.path === location);

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
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
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

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <Fragment key={item.path}>
                    {item.label === "Dashboard" && (
                      <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Overview
                      </div>
                    )}
                    {item.path === "/research" && (
                      <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Discover
                      </div>
                    )}
                    {item.label === "My Scripts" && (
                      <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Create
                      </div>
                    )}
                    {item.label === "Settings" && (
                      <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Account
                      </div>
                    )}
                    <SidebarMenuItem>
                      {(() => {
                        const mockupTooltip = SIDEBAR_NAV_TOOLTIPS[item.path];
                        const button = (
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(item.path)}
                            tooltip={mockupTooltip ? undefined : item.label}
                            className="h-10 transition-all font-normal"
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                            />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        );
                        return mockupTooltip ? (
                          <Tooltip content={mockupTooltip} side="right">
                            {button}
                          </Tooltip>
                        ) : (
                          button
                        );
                      })()}
                    </SidebarMenuItem>
                  </Fragment>
                );
              })}
              {user?.role === "admin" &&
                adminMenuItems.map(item => {
                  const isActive = location === item.path;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className="h-10 transition-all font-normal"
                      >
                        <item.icon
                          className={`h-4 w-4 ${isActive ? "text-primary" : "text-purple-400"}`}
                        />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
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
                    posthog?.capture("user_signed_out");
                    posthog?.reset();
                    logout();
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
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
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
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
