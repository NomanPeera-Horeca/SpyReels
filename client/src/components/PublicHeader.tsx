import { Link, useLocation } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";
import { usePostHog } from "@posthog/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { AuthDialog } from "@/components/AuthDialog";

const SPYREELS_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

export function PublicHeader() {
  const { user } = useAuth();
  const posthog = usePostHog();
  const [pathname] = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const handleStart = (mode: "login" | "signup") => {
    posthog?.capture("public_header_cta_clicked", { path: pathname, mode });
    if (user) {
      window.location.href = "/";
      return;
    }
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <img
                src={SPYREELS_LOGO}
                alt="SpyReels"
                className="h-9 w-9"
              />
              <span className="text-lg font-semibold tracking-tight">
                SpyReels
              </span>
            </Link>

            <div className="hidden items-center gap-7 md:flex">
              <a
                href="/#features"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Features
              </a>
              <a
                href="/#how-it-works"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                How It Works
              </a>
              <a
                href="/pricing#plans"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Pricing
              </a>
              <a
                href="/#faq"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                FAQ
              </a>
              <Link
                href="/blog"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Blog
              </Link>
              <Link
                href="/affiliate"
                className="flex items-center gap-1.5 text-sm text-primary transition-colors hover:text-primary/80"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Earn 20%
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStart("login")}
                className="bg-transparent"
              >
                {user ? "Dashboard" : "Log In"}
              </Button>
              <Button size="sm" onClick={() => handleStart("signup")}>
                {user ? "Open App" : "Start Free"}
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
