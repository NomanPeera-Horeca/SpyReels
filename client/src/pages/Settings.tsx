import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePostHog } from "@posthog/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { InterestsEditorSection } from "@/components/InterestsEditorSection";
import { BusinessPersonalizationSection } from "@/components/BusinessPersonalizationSection";
import { FeatureRequestCard } from "@/components/FeatureRequestCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Globe,
  Check,
  Loader2,
  Send,
  Copy,
  Unlink,
  ExternalLink,
  CheckCircle,
  Clock,
  Monitor,
  Sun,
  Moon,
} from "lucide-react";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)", offset: "UTC-5" },
  { value: "America/Chicago", label: "Central Time (CT/CST)", offset: "UTC-6" },
  { value: "America/Denver", label: "Mountain Time (MT)", offset: "UTC-7" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", offset: "UTC-8" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)", offset: "UTC-9" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)", offset: "UTC-10" },
  { value: "Europe/London", label: "London (GMT/BST)", offset: "UTC+0" },
  { value: "Europe/Paris", label: "Central Europe (CET)", offset: "UTC+1" },
  { value: "Europe/Istanbul", label: "Turkey (TRT)", offset: "UTC+3" },
  { value: "Asia/Dubai", label: "Gulf Standard (GST)", offset: "UTC+4" },
  { value: "Asia/Karachi", label: "Pakistan (PKT)", offset: "UTC+5" },
  { value: "Asia/Kolkata", label: "India (IST)", offset: "UTC+5:30" },
  { value: "Asia/Bangkok", label: "Indochina (ICT)", offset: "UTC+7" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", offset: "UTC+8" },
  { value: "Asia/Tokyo", label: "Japan (JST)", offset: "UTC+9" },
  { value: "Australia/Sydney", label: "Sydney (AEST)", offset: "UTC+10" },
  { value: "Pacific/Auckland", label: "New Zealand (NZST)", offset: "UTC+12" },
];

export default function Settings() {
  const posthog = usePostHog();
  const { themePreference, setThemePreference } = useTheme();
  const prefsQuery = trpc.preferences.get.useQuery();
  const telegramQuery = trpc.telegram.status.useQuery();
  const updatePrefs = trpc.preferences.update.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      prefsQuery.refetch();
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const generateLinkCode = trpc.telegram.generateLinkCode.useMutation({
    onSuccess: () => {
      telegramQuery.refetch();
    },
    onError: err => toast.error(err.message),
  });

  const disconnectTelegram = trpc.telegram.disconnect.useMutation({
    onSuccess: () => {
      telegramQuery.refetch();
      toast.success("Telegram disconnected");
      setLinkCode(null);
    },
    onError: err => toast.error(err.message),
  });

  const [timezone, setTimezone] = useState("America/Chicago");
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeExpiry, setLinkCodeExpiry] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);

  useEffect(() => {
    if (prefsQuery.data?.timezone) {
      setTimezone(prefsQuery.data.timezone);
    }
  }, [prefsQuery.data?.timezone]);

  const hasChanges =
    timezone !== (prefsQuery.data?.timezone || "America/Chicago");
  const isConnected = telegramQuery.data?.connected;

  const handleGenerateCode = () => {
    posthog?.capture("telegram_connect_initiated");
    generateLinkCode.mutate(undefined, {
      onSuccess: data => {
        setLinkCode(data.code);
        setLinkCodeExpiry(data.expiresAt);
        setBotUsername(data.botUsername);
      },
    });
  };

  const handleCopyCode = () => {
    if (linkCode) {
      navigator.clipboard.writeText(linkCode);
      toast.success("Link code copied!");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
      </div>

      <FeatureRequestCard />

      <div className="rounded-lg border border-border/50 bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Appearance
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Choose how SpyReels looks. You can also use the quick theme control
          in the sidebar.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setThemePreference("system")}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              themePreference === "system"
                ? "border-primary bg-primary/5"
                : "border-border/50 bg-background hover:bg-muted/50"
            )}
          >
            <Monitor className="mb-2 h-4 w-4 text-primary" aria-hidden />
            <div className="text-sm font-medium">System</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Match your device theme
            </p>
          </button>
          <button
            type="button"
            onClick={() => setThemePreference("light")}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              themePreference === "light"
                ? "border-primary bg-primary/5"
                : "border-border/50 bg-background hover:bg-muted/50"
            )}
          >
            <Sun className="mb-2 h-4 w-4 text-primary" aria-hidden />
            <div className="text-sm font-medium">Light</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Always use light (beta)
            </p>
          </button>
          <button
            type="button"
            onClick={() => setThemePreference("dark")}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              themePreference === "dark"
                ? "border-primary bg-primary/5"
                : "border-border/50 bg-background hover:bg-muted/50"
            )}
          >
            <Moon className="mb-2 h-4 w-4 text-primary" aria-hidden />
            <div className="text-sm font-medium">Dark</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Always use dark
            </p>
          </button>
        </div>
      </div>

      <InterestsEditorSection variant="settings" />

      <BusinessPersonalizationSection />

      {/* Telegram Connection Section */}
      <div className="rounded-lg border border-border/50 bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Send className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-foreground">
            Telegram Bot Connection
          </h2>
          {isConnected && (
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle className="h-3 w-3" /> Connected
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Connect your Telegram account to collect Instagram Reels from your
          phone. Share any Reel link to the SpyReels bot and it appears in your
          Collected Reels tab.
        </p>

        {isConnected ? (
          <div className="space-y-3">
            <div className="p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span>
                  Connected
                  {telegramQuery.data?.telegramUsername && (
                    <>
                      {" "}
                      as <strong>@{telegramQuery.data.telegramUsername}</strong>
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 ml-6">
                Share Instagram Reel links to{" "}
                {telegramQuery.data?.botUsername ? (
                  <a
                    href={`https://t.me/${telegramQuery.data.botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    @{telegramQuery.data.botUsername}
                  </a>
                ) : (
                  "the SpyReels bot"
                )}{" "}
                on Telegram and they'll appear in your Collected Reels.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => disconnectTelegram.mutate()}
              disabled={disconnectTelegram.isPending}
            >
              {disconnectTelegram.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unlink className="mr-1.5 h-3.5 w-3.5" />
              )}
              Disconnect Telegram
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {!linkCode ? (
              <div>
                <Button
                  onClick={handleGenerateCode}
                  disabled={generateLinkCode.isPending}
                >
                  {generateLinkCode.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                      Generating...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" /> Connect Telegram
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Step 1: Open bot */}
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <p className="text-sm text-foreground font-medium">
                      Open the SpyReels Bot on Telegram
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 text-xs"
                      onClick={() =>
                        window.open(
                          `https://t.me/${botUsername || "SpyReelsBot"}`,
                          "_blank"
                        )
                      }
                    >
                      <ExternalLink className="mr-1.5 h-3 w-3" />
                      Open @{botUsername || "SpyReelsBot"}
                    </Button>
                  </div>
                </div>

                {/* Step 2: Send code */}
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <p className="text-sm text-foreground font-medium">
                      Send this code to the bot
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="bg-muted/50 border border-border rounded-md px-4 py-2 font-mono text-lg tracking-[0.3em] text-foreground font-bold select-all">
                        {linkCode}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={handleCopyCode}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Code expires in 10 minutes</span>
                    </div>
                  </div>
                </div>

                {/* Step 3: Done */}
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <p className="text-sm text-foreground font-medium">
                      Start sharing Reel links!
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Once connected, share any Instagram Reel link to the bot
                      from your phone. On Instagram: tap Share → Share to
                      Telegram → select SpyReels Bot.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={handleGenerateCode}
                    disabled={generateLinkCode.isPending}
                  >
                    <Loader2
                      className={`mr-1.5 h-3 w-3 ${generateLinkCode.isPending ? "animate-spin" : "hidden"}`}
                    />
                    Generate New Code
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timezone Section */}
      <div className="rounded-lg border border-border/50 bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Timezone Preference
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          All posting times for competitor reels and your scheduled scripts will
          be displayed in this timezone. Default is Central Standard Time (CST).
        </p>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Your Timezone
            </label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value}>
                    <span className="flex items-center gap-2">
                      <span>{tz.label}</span>
                      <span className="text-muted-foreground text-xs">
                        ({tz.offset})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => updatePrefs.mutate({ timezone })}
            disabled={!hasChanges || updatePrefs.isPending}
            className="shrink-0"
          >
            {updatePrefs.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" /> Save
              </>
            )}
          </Button>
        </div>

        <div className="mt-4 p-3 rounded-md bg-muted/30 border border-border/30">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Current:</strong>{" "}
            {new Date().toLocaleString("en-US", {
              timeZone: timezone,
              weekday: "long",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}{" "}
            ({TIMEZONES.find(t => t.value === timezone)?.label || timezone})
          </p>
        </div>
      </div>
    </div>
  );
}
