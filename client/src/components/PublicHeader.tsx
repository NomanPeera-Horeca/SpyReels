import { Link, useLocation } from "wouter";
import { Menu, Sparkles, ArrowRight } from "lucide-react";
import { usePostHog } from "@posthog/react";
import { useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { AuthDialog } from "@/components/AuthDialog";
import { SPYREELS_LOGO_URL } from "@/lib/brandAssets";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const PUBLIC_NAV_LINKS = [
  { href: "/#features", label: "Features", type: "anchor" as const },
  {
    href: "/free-tools/viral-hooks",
    label: "Free Tools",
    type: "route" as const,
  },
  { href: "/#how-it-works", label: "How It Works", type: "anchor" as const },
  { href: "/pricing#plans", label: "Pricing", type: "anchor" as const },
  { href: "/#faq", label: "FAQ", type: "anchor" as const },
  { href: "/blog", label: "Blog", type: "route" as const },
  {
    href: "/affiliate",
    label: "Earn 20%",
    type: "route" as const,
    highlight: true,
  },
];

export function PublicHeader() {
  const { user } = useAuth();
  const posthog = usePostHog();
  const [pathname] = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleStart = (mode: "login" | "signup") => {
    posthog?.capture("public_header_cta_clicked", { path: pathname, mode });
    if (user) {
      window.location.href = "/";
      return;
    }
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const closeMobileNav = () => setMobileNavOpen(false);

  const onFreeToolsClick = (e: MouseEvent) => {
    if (pathname === "/free-tools/viral-hooks") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    closeMobileNav();
  };

  return (
    <>
      <nav className="sticky top-0 z-50 overflow-x-hidden border-b border-border/50 bg-background/80 pt-safe backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 md:hidden"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="flex w-[min(100vw-2rem,20rem)] flex-col px-safe pb-safe pt-safe"
                >
                  <SheetHeader className="border-b pb-4 text-left">
                    <SheetTitle className="flex items-center gap-2">
                      <img
                        src={SPYREELS_LOGO_URL}
                        alt="SpyReels"
                        width={32}
                        height={32}
                        className="h-8 w-8"
                      />
                      SpyReels
                    </SheetTitle>
                  </SheetHeader>
                  <nav className="flex flex-1 flex-col gap-1 py-4">
                    {PUBLIC_NAV_LINKS.map(item => {
                      if (item.type === "route") {
                        return (
                          <SheetClose asChild key={item.href}>
                            <Link
                              href={item.href}
                              onClick={
                                item.href === "/free-tools/viral-hooks"
                                  ? onFreeToolsClick
                                  : closeMobileNav
                              }
                              className={`inline-flex min-h-10 items-center rounded-lg px-3 text-sm transition-colors hover:bg-accent ${
                                item.highlight
                                  ? "gap-2 text-primary"
                                  : "text-foreground"
                              }`}
                            >
                              {item.highlight ? (
                                <Sparkles className="h-4 w-4 shrink-0" />
                              ) : null}
                              {item.label}
                            </Link>
                          </SheetClose>
                        );
                      }
                      return (
                        <SheetClose asChild key={item.href}>
                          <a
                            href={item.href}
                            className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm text-foreground transition-colors hover:bg-accent"
                          >
                            {item.label}
                          </a>
                        </SheetClose>
                      );
                    })}
                  </nav>
                  <div className="mt-auto flex flex-col gap-2 border-t pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        closeMobileNav();
                        handleStart("login");
                      }}
                    >
                      {user ? "Dashboard" : "Log In"}
                    </Button>
                    <Button
                      onClick={() => {
                        closeMobileNav();
                        handleStart("signup");
                      }}
                    >
                      {user ? "Open App" : "Start Free"}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
              <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
                <img
                  src={SPYREELS_LOGO_URL}
                  alt="SpyReels logo, Instagram Reels spy tool"
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0"
                  fetchPriority="high"
                  decoding="async"
                />
                <span className="truncate text-lg font-semibold tracking-tight">
                  SpyReels
                </span>
              </Link>
            </div>

            <div className="hidden items-center gap-7 md:flex">
              {PUBLIC_NAV_LINKS.map(item => {
                if (item.type === "route") {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={
                        item.highlight
                          ? "flex items-center gap-1.5 text-sm text-primary transition-colors hover:text-primary/80"
                          : "text-sm text-muted-foreground transition-colors hover:text-foreground"
                      }
                      onClick={
                        item.href === "/free-tools/viral-hooks"
                          ? onFreeToolsClick
                          : undefined
                      }
                    >
                      {item.highlight ? (
                        <Sparkles className="h-3.5 w-3.5" />
                      ) : null}
                      {item.label}
                    </Link>
                  );
                }
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </a>
                );
              })}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStart("login")}
                className="min-h-10 bg-transparent px-2.5 sm:px-3"
              >
                <span className="hidden sm:inline">
                  {user ? "Dashboard" : "Log In"}
                </span>
                <span className="sm:hidden">{user ? "App" : "Log In"}</span>
              </Button>
              <Button size="sm" className="min-h-10 px-2.5 sm:px-3" onClick={() => handleStart("signup")}>
                <span className="hidden sm:inline">
                  {user ? "Open App" : "Start Free"}
                </span>
                <span className="sm:hidden">{user ? "Open" : "Start"}</span>
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode={authMode}
      />
    </>
  );
}
