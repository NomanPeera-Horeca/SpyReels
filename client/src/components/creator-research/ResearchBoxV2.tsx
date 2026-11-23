/**
 * The research box on the combined Creator Research page (Figma page 18,
 * "Research a creator"): platform tabs, then one row of
 * [@username or profile link] [Last 30 days] [Research], with one line of
 * plain text under it for errors or the monthly limit.
 *
 * Instagram keeps every existing behaviour (profile check, preview card,
 * sign-in hand-off), so its state lives in Home.tsx and comes in as props.
 * TikTok and YouTube start their research here and open the results page,
 * the same way their old forms did.
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isValidTikTokHandleNormalized,
  isValidYouTubeHandleNormalized,
  normalizeTikTokHandle,
  normalizeYouTubeHandle,
} from "@shared/socialHandles";

export type ResearchPlatform = "instagram" | "tiktok" | "youtube";
type Timeframe = "30" | "90" | "180";

const PLATFORMS: Array<{ id: ResearchPlatform; label: string }> = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
];

/** Underlined tabs, the same look as "My creators | Explore creators". */
export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  ruled = false,
  testIdPrefix,
}: {
  items: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  /** Draw the full-width line under the tabs. */
  ruled?: boolean;
  testIdPrefix: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-6",
        ruled && "border-b border-[var(--sr-color-border-subtle)]"
      )}
    >
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "-mb-px border-b-2 px-1 pb-2 text-sm transition-colors",
            value === item.id
              ? "border-[var(--sr-color-brand-primary)] font-medium text-[var(--sr-color-text-brand)]"
              : "border-transparent text-[var(--sr-color-text-secondary)] hover:text-[var(--sr-color-text-primary)]"
          )}
          data-testid={`${testIdPrefix}-${item.id}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export type InstagramRowProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Spinner / tick / cross at the right of the input. */
  statusIcon: ReactNode;
  error: string | null;
  invalid: boolean;
  submitting: boolean;
  submitDisabled: boolean;
  onSubmit: () => void;
  /** Profile preview card and its errors, shown under the row. */
  below: ReactNode;
};

export type ResearchLimit = {
  loading: boolean;
  allowed: boolean;
  limit: number;
};

export function ResearchBoxV2({
  platform,
  onPlatformChange,
  timeframe,
  onTimeframeChange,
  instagram,
  limit,
}: {
  platform: ResearchPlatform;
  onPlatformChange: (platform: ResearchPlatform) => void;
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
  instagram: InstagramRowProps;
  limit: ResearchLimit;
}) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [otherHandle, setOtherHandle] = useState("");
  const [otherError, setOtherError] = useState<string | null>(null);

  const onStartError = (err: unknown) => {
    if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN")
      setOtherError("You've used all your researches this month.");
    else
      setOtherError(
        err instanceof Error
          ? err.message
          : "Couldn't start the research. Try again."
      );
  };
  const tiktokStart = trpc.tiktokScrape.start.useMutation({
    onSuccess: data => {
      void utils.tiktokScrape.list.invalidate();
      setLocation(`/tiktok-scraping?jobId=${data.jobId}&from=research`);
    },
    onError: onStartError,
  });
  const youtubeStart = trpc.youtubeScrape.start.useMutation({
    onSuccess: data => {
      void utils.youtubeScrape.list.invalidate();
      setLocation(`/youtube-scraping?jobId=${data.jobId}&from=research`);
    },
    onError: onStartError,
  });

  const isInstagram = platform === "instagram";
  const platformName = PLATFORMS.find(p => p.id === platform)!.label;
  const otherNormalized =
    platform === "tiktok"
      ? normalizeTikTokHandle(otherHandle)
      : normalizeYouTubeHandle(otherHandle);
  const otherValid =
    platform === "tiktok"
      ? isValidTikTokHandleNormalized(otherNormalized)
      : isValidYouTubeHandleNormalized(otherNormalized);
  const otherPending = tiktokStart.isPending || youtubeStart.isPending;
  const outOfResearches = !limit.loading && !limit.allowed;

  const startOther = () => {
    if (!otherValid) {
      setOtherError(
        `That doesn't look like a ${platformName} username. Check the spelling, or paste their profile link.`
      );
      return;
    }
    setOtherError(null);
    const tf = (
      ["30", "90", "180"].includes(timeframe) ? timeframe : "30"
    ) as Timeframe;
    if (platform === "tiktok")
      tiktokStart.mutate({ handle: otherNormalized, timeframe: tf });
    else youtubeStart.mutate({ handle: otherNormalized, timeframe: tf });
  };

  const value = isInstagram ? instagram.value : otherHandle;
  const error = isInstagram ? instagram.error : otherError;
  const invalid = isInstagram ? instagram.invalid : Boolean(otherError);
  const submitting = isInstagram ? instagram.submitting : otherPending;
  const submitDisabled = isInstagram
    ? instagram.submitDisabled
    : otherPending || !otherHandle.trim() || outOfResearches || limit.loading;

  return (
    <div className="space-y-4">
      <UnderlineTabs
        items={PLATFORMS}
        value={platform}
        onChange={p => {
          setOtherError(null);
          onPlatformChange(p);
        }}
        testIdPrefix="research-platform"
      />
      <form
        onSubmit={e => {
          e.preventDefault();
          if (submitDisabled) return;
          if (isInstagram) instagram.onSubmit();
          else startOther();
        }}
        className="space-y-3"
        data-testid="research-form-v2"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Input
              id="handle"
              placeholder="@username or profile link"
              value={value}
              onChange={e => {
                if (isInstagram) instagram.onChange(e.target.value);
                else {
                  setOtherHandle(e.target.value);
                  setOtherError(null);
                }
              }}
              onBlur={isInstagram ? instagram.onBlur : undefined}
              className={cn(
                "h-12 border-[var(--sr-color-border-control)] bg-[var(--sr-color-surface-default)] pr-9 text-[15px]",
                invalid && "border-[var(--sr-color-status-error-border)]"
              )}
              aria-label={`${platformName} username or profile link`}
              aria-invalid={invalid}
              aria-describedby={error ? "research-error" : undefined}
            />
            {isInstagram ? instagram.statusIcon : null}
          </div>
          <div className="flex gap-2">
            <Select value={timeframe} onValueChange={onTimeframeChange}>
              <SelectTrigger
                className="h-12! w-44 shrink-0 border-[var(--sr-color-border-control)] bg-[var(--sr-color-surface-default)] font-medium text-[var(--sr-color-text-primary)] sm:w-44"
                aria-label="Timeframe"
              >
                <CalendarDays className="mr-2 h-4 w-4" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="180">Last 180 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="submit"
              className="h-12 flex-1 px-6 font-semibold sm:flex-none"
              disabled={submitDisabled}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : (
                "Research"
              )}
            </Button>
          </div>
        </div>
        {error ? (
          <p
            id="research-error"
            className="text-xs text-[var(--sr-color-status-error-foreground)]"
            role="alert"
          >
            {error}
          </p>
        ) : outOfResearches ? (
          <p
            className="text-xs text-amber-700 dark:text-amber-400"
            data-testid="research-limit-note"
          >
            You've used all {limit.limit > 0 ? `${limit.limit} ` : ""}researches
            this month. Opening creators you already researched is still free.{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => setLocation("/pricing")}
            >
              See plans
            </button>
          </p>
        ) : null}
        {isInstagram ? instagram.below : null}
      </form>
    </div>
  );
}
