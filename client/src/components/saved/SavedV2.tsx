/**
 * Combined Saved page (Figma "19 — Saved (Saved + Collected)", approved
 * 2026-11-24), behind SAVED_V2_MODE. One page for every video to remake later:
 *
 *   Saved
 *   [ Paste an Instagram, TikTok or YouTube link ] [Add video]
 *   Tip: send links to the Telegram bot…
 *   All · N | Starred · N | From links · N            [Newest first] [···]
 *   (adding / failed link rows)
 *   one grid: starred videos + videos added by link, sorted together
 *
 * The cards, remake flow and dialogs come from the existing Saved and
 * Collected libraries (embedded); this page owns the header, link box, tabs,
 * sort, the ··· menu and the adding/failed rows.
 */
import { useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { usePostHog } from "posthog-js/react";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { useIsMobile } from "@/hooks/useMobile";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResultCardSkeleton,
  resultCardGridClass,
} from "@/design-system/ResultCard";
import { IconMore } from "@/design-system/icons";
import { UnderlineTabs } from "@/components/creator-research/ResearchBoxV2";
import { SavedLibrary } from "@/pages/SavedReels";
import { CollectedLibrary } from "@/pages/CollectedReels";
import {
  SAVED_SORT_LABELS,
  collectedRowSortFields,
  mergedOrder,
  savedItemSortFields,
  savedTabFromSearch,
  type LibraryEmbed,
  type SavedSort,
  type SavedTab,
} from "./savedLibrary";

const card =
  "rounded-[var(--sr-radius-12)] border border-[var(--sr-color-border-subtle)] bg-[var(--sr-color-surface-default)]";

/** "https://www.instagram.com/reel/abc/" -> "instagram.com/reel/abc". Pure. */
export function shortLink(url: string | null | undefined): string {
  const s = (url ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
  return s.length > 42 ? `${s.slice(0, 41)}…` : s || "your link";
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div
      className={cn(card, "flex flex-col items-center px-6 py-10 text-center")}
      data-testid="saved-empty"
    >
      <p className="text-base font-semibold text-[var(--sr-color-text-primary)]">
        {title}
      </p>
      <p className="mt-1 max-w-md text-sm text-[var(--sr-color-text-secondary)]">
        {body}
      </p>
    </div>
  );
}

export function SavedV2() {
  const { resolvedTheme } = useTheme();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const posthog = usePostHog();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<SavedTab>(() => savedTabFromSearch(search));
  const [sort, setSort] = useState<SavedSort>("newest");
  const [url, setUrl] = useState("");
  const isMobile = useIsMobile();
  const actionsRef = useRef<{ transcribeAll?: () => Promise<void> } | null>(
    null
  );

  // Same queries (and cache) the embedded libraries use.
  const savedQuery = trpc.saved.list.useQuery(undefined, {
    staleTime: 45_000,
    gcTime: 5 * 60_000,
  });
  const collectedQuery = trpc.collected.list.useQuery(undefined, {
    refetchInterval: query =>
      query.state.data?.some(r => r.status === "pending") ? 3000 : 8000,
  });
  const telegramQuery = trpc.telegram.status.useQuery();

  const savedItems = savedQuery.data ?? [];
  const collectedRows = collectedQuery.data ?? [];
  const readyRows = collectedRows.filter(r => r.status === "ready");
  const pendingRows = collectedRows.filter(r => r.status === "pending");
  const failedRows = collectedRows.filter(r => r.status === "failed");

  // A starred link video is in both lists; in "All" it shows once, as its link card.
  const linkMirrorIds = useMemo(
    () =>
      new Set(
        readyRows
          .map(r => r.transcriptionReelId)
          .filter((id): id is number => id != null && id > 0)
      ),
    [readyRows]
  );
  const duplicateSavedKeys = useMemo(
    () =>
      new Set(
        savedItems
          .filter(i => i.reelId != null && linkMirrorIds.has(i.reelId))
          .map(i => `s:${i.id}`)
      ),
    [savedItems, linkMirrorIds]
  );
  const counts = {
    starred: savedItems.length,
    links: readyRows.length,
    all: savedItems.length - duplicateSavedKeys.size + readyRows.length,
  };

  const order = useMemo(
    () =>
      mergedOrder(
        [
          ...savedItems.map(savedItemSortFields),
          ...readyRows.map(collectedRowSortFields),
        ],
        sort
      ),
    [savedItems, readyRows, sort]
  );
  const embedBase = { sort, order: (key: string) => order.get(key) ?? 0 };
  const savedEmbed: LibraryEmbed = {
    ...embedBase,
    hidden: tab === "links",
    exclude: tab === "all" ? key => duplicateSavedKeys.has(key) : undefined,
    actionsRef,
  };
  const collectedEmbed: LibraryEmbed = {
    ...embedBase,
    hidden: tab === "starred",
  };

  const addByUrl = trpc.collected.addByUrl.useMutation({
    onSuccess: data => {
      void utils.collected.list.invalidate();
      if (data.duplicate) toast.info("This video is already saved");
      else {
        if (!data.retried) posthog?.capture("reel_added_by_url");
        if (tab === "starred") setTab("all");
      }
      setUrl("");
    },
    onError: err => toast.error(err.message),
  });
  const retry = trpc.collected.retry.useMutation({
    onSuccess: () => void utils.collected.list.invalidate(),
  });
  const remove = trpc.collected.delete.useMutation({
    onSuccess: () => {
      void utils.collected.list.invalidate();
      toast.success("Link removed");
    },
  });
  const clearFailed = trpc.collected.deleteFailed.useMutation({
    onSuccess: data => {
      void utils.collected.list.invalidate();
      toast.success(
        `Removed ${data.deleted} failed link${data.deleted === 1 ? "" : "s"}`
      );
    },
    onError: err => toast.error(err.message),
  });
  const refreshAll = trpc.collected.refreshAll.useMutation({
    onSuccess: data => {
      void utils.collected.list.invalidate();
      if (data.refreshed > 0)
        toast.success(
          `Refreshing numbers for ${data.refreshed} video${data.refreshed === 1 ? "" : "s"}…`
        );
      else toast.info("Everything is up to date");
    },
  });

  const untranscribed = savedItems.filter(
    i => !i.transcription || i.transcription.status !== "completed"
  ).length;
  const [transcribing, setTranscribing] = useState(false);
  const telegram = telegramQuery.data;
  const loading = savedQuery.isLoading || collectedQuery.isLoading;
  const loadError = savedQuery.isError || collectedQuery.isError;
  const showLinkRows = tab !== "starred";
  const shownCount =
    tab === "all"
      ? counts.all
      : tab === "starred"
        ? counts.starred
        : counts.links;
  const nothingYet =
    !loading &&
    !loadError &&
    counts.all === 0 &&
    pendingRows.length === 0 &&
    failedRows.length === 0;
  const autoFocus = new URLSearchParams(search).get("add") === "1";

  const submit = () => {
    const v = url.trim();
    if (!v || addByUrl.isPending) return;
    addByUrl.mutate({ url: v });
  };

  return (
    <div
      className={cn(
        resolvedTheme === "dark" ? "sr-scope-dark" : "sr-scope-light",
        "sr-mode-product",
        "mx-auto w-full max-w-[880px] px-2 pb-12 pt-4 sm:px-0 sm:pt-8"
      )}
      style={{ background: "transparent" }}
      data-testid="saved-v2"
    >
      <header className="mb-6">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--sr-color-text-primary)]">
          Saved
        </h1>
        <p className="mt-1 text-sm text-[var(--sr-color-text-secondary)]">
          Videos you want to remake later, all in one place.
        </p>
      </header>

      <section
        className={cn(card, "mb-8 space-y-3 p-5")}
        aria-label="Add a video"
      >
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={
              isMobile
                ? "Paste a video link"
                : "Paste an Instagram, TikTok or YouTube link"
            }
            aria-label="Video link"
            autoFocus={autoFocus}
            className="h-12 w-full min-w-0 border-[var(--sr-color-border-control)] sm:flex-1 bg-[var(--sr-color-surface-default)] text-[15px]"
            data-testid="saved-link-input"
          />
          <Button
            type="submit"
            className="h-12 px-6 font-semibold"
            disabled={!url.trim() || addByUrl.isPending}
          >
            {addByUrl.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding…
              </>
            ) : (
              "Add video"
            )}
          </Button>
        </form>
        {telegramQuery.isLoading ? null : telegram?.connected ? (
          <p className="text-xs text-[var(--sr-color-text-secondary)]">
            Telegram is connected
            {telegram.botUsername
              ? `: send links to @${telegram.botUsername}`
              : ""}{" "}
            and they show up here.
          </p>
        ) : (
          <p className="text-xs text-[var(--sr-color-text-secondary)]">
            Tip: send video links to our Telegram bot from your phone and they
            show up here.{" "}
            <button
              type="button"
              className="font-semibold text-[var(--sr-color-text-brand)]"
              onClick={() => setLocation("/settings")}
            >
              Connect Telegram
            </button>
          </p>
        )}
      </section>

      {nothingYet ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:border-b sm:border-[var(--sr-color-border-subtle)]">
          <div className="min-w-0 flex-1 overflow-x-auto border-b border-[var(--sr-color-border-subtle)] sm:border-b-0">
            <UnderlineTabs
              items={[
                { id: "all" as const, label: `All · ${counts.all}` },
                {
                  id: "starred" as const,
                  label: `Starred · ${counts.starred}`,
                },
                { id: "links" as const, label: `From links · ${counts.links}` },
              ]}
              value={tab}
              onChange={setTab}
              testIdPrefix="saved-tab"
            />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 sm:mb-2">
            <Select value={sort} onValueChange={v => setSort(v as SavedSort)}>
              <SelectTrigger
                className="h-9 w-auto min-w-[9.5rem] border-[var(--sr-color-border-control)] bg-[var(--sr-color-surface-default)] font-medium"
                aria-label="Sort"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SAVED_SORT_LABELS) as SavedSort[]).map(k => (
                  <SelectItem key={k} value={k}>
                    {SAVED_SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-[var(--sr-radius-8)] border border-[var(--sr-color-border-control)] bg-[var(--sr-color-surface-default)] hover:bg-[var(--sr-color-surface-hover)]"
                  aria-label="More actions"
                  data-testid="saved-more"
                >
                  <IconMore />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  disabled={untranscribed === 0 || transcribing}
                  onSelect={() => {
                    const run = actionsRef.current?.transcribeAll;
                    if (!run) return;
                    setTranscribing(true);
                    void run().finally(() => setTranscribing(false));
                  }}
                >
                  {untranscribed > 0
                    ? `Get transcripts for all (${untranscribed})`
                    : "All transcripts ready"}
                </DropdownMenuItem>
                {readyRows.length > 0 ? (
                  <DropdownMenuItem
                    disabled={refreshAll.isPending}
                    onSelect={() => refreshAll.mutate()}
                  >
                    Refresh numbers for links
                  </DropdownMenuItem>
                ) : null}
                {failedRows.length > 0 ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => clearFailed.mutate()}
                  >
                    Clear {failedRows.length} failed link
                    {failedRows.length === 1 ? "" : "s"}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {showLinkRows
          ? pendingRows.map(row => (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-[var(--sr-radius-12)] bg-[var(--sr-color-brand-surface-subtle)] px-4 py-4"
                aria-live="polite"
                data-testid="saved-adding-row"
              >
                <Loader2
                  className="h-5 w-5 shrink-0 animate-spin text-[var(--sr-color-text-brand)]"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[var(--sr-color-text-primary)]">
                    Adding a video from {shortLink(row.reelUrl)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--sr-color-text-secondary)]">
                    Getting the video and its numbers. Usually under a minute.
                    You can leave this page.
                  </p>
                  <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-[var(--sr-color-surface-default)]">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--sr-color-brand-primary)]" />
                  </div>
                </div>
              </div>
            ))
          : null}
        {showLinkRows
          ? failedRows.map(row => (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-[var(--sr-radius-12)] bg-[var(--sr-color-status-error-background)] px-4 py-4 sm:flex-row sm:items-center"
                data-testid="saved-failed-row"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[var(--sr-color-status-error-foreground)]">
                    Couldn't add {shortLink(row.reelUrl)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--sr-color-text-secondary)]">
                    {row.errorMessage?.trim() ||
                      "This video may be private or deleted. Check the link and try again."}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate({ id: row.id })}
                  >
                    Try again
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: row.id })}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          : null}
      </div>

      <div className="mt-5">
        {loadError ? (
          <div
            className={cn(
              card,
              "flex flex-col items-center px-6 py-10 text-center"
            )}
          >
            <p className="text-base font-semibold text-[var(--sr-color-text-primary)]">
              Couldn't load your videos
            </p>
            <p className="mt-1 text-sm text-[var(--sr-color-text-secondary)]">
              Check your connection and try again.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              onClick={() => {
                void savedQuery.refetch();
                void collectedQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : loading ? (
          <div className={resultCardGridClass} aria-label="Loading your videos">
            {Array.from({ length: 6 }).map((_, i) => (
              <ResultCardSkeleton key={i} mediaFormat="portrait" />
            ))}
          </div>
        ) : shownCount === 0 &&
          !(
            showLinkRows &&
            (pendingRows.length > 0 || failedRows.length > 0)
          ) ? (
          tab === "starred" ? (
            <Empty
              title="No starred videos yet"
              body="Tap the star on any video to keep it here."
            />
          ) : tab === "links" ? (
            <Empty
              title="No links added yet"
              body="Paste a link above, or send one to our Telegram bot."
            />
          ) : (
            <Empty
              title="Nothing saved yet"
              body="Tap the star on any video to keep it here, or paste a link above."
            />
          )
        ) : null}
        {/* Always mounted (dialogs + remake flow); cards from both libraries share one grid. */}
        <div
          className={cn(
            resultCardGridClass,
            (loading || loadError) && "hidden"
          )}
          data-testid="saved-grid"
        >
          <SavedLibrary embed={savedEmbed} />
          <CollectedLibrary embed={collectedEmbed} />
        </div>
      </div>
    </div>
  );
}
