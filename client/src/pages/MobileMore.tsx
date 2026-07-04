import { useAuth } from "@/_core/hooks/useAuth";
import { AppLink } from "@/components/AppLink";
import {
  ChevronRight,
  CreditCard,
  ExternalLink,
  Lightbulb,
  Monitor,
  Settings,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const DESKTOP_URL = "https://spyreels.ai/dashboard";

const navRowClass =
  "flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50";

export default function MobileMore() {
  const { user } = useAuth();

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">More</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account and full SpyReels on desktop
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Research on desktop</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Spy viral Reels, discovery, and creator radar need a larger screen.
              Use the full SpyReels dashboard on your computer.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-10 gap-1.5"
              asChild
            >
              <a href={DESKTOP_URL} target="_blank" rel="noopener noreferrer">
                Open full SpyReels
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <AppLink href="/studio" className={navRowClass}>
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="flex-1 text-sm font-medium">AI Coach</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </AppLink>
        <AppLink href="/ideas" className={`${navRowClass} border-t`}>
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <span className="flex-1 text-sm font-medium">Idea to Script</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </AppLink>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <AppLink href="/settings" className={navRowClass}>
          <Settings className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">Settings</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </AppLink>
        <AppLink href="/billing" className={`${navRowClass} border-t`}>
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">Billing</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </AppLink>
      </div>

      {user?.email ? (
        <p className="text-center text-xs text-muted-foreground">{user.email}</p>
      ) : null}
    </div>
  );
}
