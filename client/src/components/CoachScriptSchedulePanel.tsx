import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TIME_OPTIONS } from "@/components/InlineWorkflow";
import { formatCoachSaveScheduleLabel } from "@shared/coachScriptSave";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseHashtagsJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((h): h is string => typeof h === "string")
      .map((h) => h.replace(/^#/, "").trim())
      .filter(Boolean);
  } catch {
    return raw
      .split(/\s+/)
      .map((h) => h.replace(/^#/, "").trim())
      .filter(Boolean);
  }
}

export type CoachScriptSaveExtras = {
  caption: string;
  hashtags: string[];
};

export type CoachScriptSchedulePanelProps = {
  coachScriptId: number;
  postDate: Date | undefined;
  onPostDateChange: (date: Date | undefined) => void;
  postTime: string;
  onPostTimeChange: (time: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  savedScriptId: number | null;
  initialCaption?: string | null;
  initialHashtagsJson?: string | null;
  isSaving: boolean;
  onSave: (withDate: boolean, extras: CoachScriptSaveExtras) => void;
  onOpenMyScripts: () => void;
  className?: string;
};

export function CoachScriptSchedulePanel({
  coachScriptId,
  postDate,
  onPostDateChange,
  postTime,
  onPostTimeChange,
  notes,
  onNotesChange,
  savedScriptId,
  initialCaption,
  initialHashtagsJson,
  isSaving,
  onSave,
  onOpenMyScripts,
  className,
}: CoachScriptSchedulePanelProps) {
  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ") ?? "Local";
  const fromDate = startOfTodayLocal();
  const isSaved = savedScriptId != null;

  const [caption, setCaption] = useState(initialCaption?.trim() ?? "");
  const [hashtags, setHashtags] = useState<string[]>(() => parseHashtagsJson(initialHashtagsJson));
  const autoStartedForId = useRef<number | null>(null);

  const generateCaptionMutation = trpc.studio.generateCaption.useMutation({
    onSuccess: (data) => {
      setCaption(data.caption);
      setHashtags(data.hashtags);
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    const nextCaption = initialCaption?.trim() ?? "";
    const nextTags = parseHashtagsJson(initialHashtagsJson);
    setCaption(nextCaption);
    setHashtags(nextTags);
    autoStartedForId.current = null;
  }, [coachScriptId, initialCaption, initialHashtagsJson]);

  useEffect(() => {
    if (autoStartedForId.current === coachScriptId) return;
    if (caption.trim() || hashtags.length > 0) {
      autoStartedForId.current = coachScriptId;
      return;
    }
    if (generateCaptionMutation.isPending) return;
    autoStartedForId.current = coachScriptId;
    generateCaptionMutation.mutate({ id: coachScriptId });
    // Intentionally only when panel mounts / script changes with empty caption.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachScriptId, caption, hashtags.length]);

  const captionPending = generateCaptionMutation.isPending;
  const hashtagsText = hashtags.map((t) => `#${t}`).join(" ");

  const copyText = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(success);
    } catch {
      toast.error("Could not copy");
    }
  };

  const handleSave = (withDate: boolean) => {
    onSave(withDate, {
      caption: caption.trim(),
      hashtags: hashtags.map((h) => h.replace(/^#/, "").trim()).filter(Boolean),
    });
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-violet-200/80 dark:border-violet-900/50 bg-white dark:bg-gray-900 p-3.5",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-xs font-bold text-foreground">Schedule &amp; save</h2>
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          New
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 leading-snug">
        {isSaved
          ? "Linked to My Scripts. Edit date, caption, or notes, then Update."
          : "Adds to My Scripts with your filming date, caption, and hashtags."}
      </p>

      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Post date
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Date</p>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-full justify-start px-2 text-left text-[11px] font-normal"
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {postDate
                    ? postDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={postDate}
                  onSelect={onPostDateChange}
                  disabled={{ before: fromDate }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Time ({tzLabel})</p>
            <Select value={postTime} onValueChange={onPostTimeChange}>
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Caption &amp; hashtags
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={captionPending}
            onClick={() => generateCaptionMutation.mutate({ id: coachScriptId })}
          >
            {captionPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {captionPending ? "Writing..." : caption ? "Regenerate" : "Generate"}
          </button>
        </div>
        {captionPending && !caption ? (
          <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-4 text-[11px] text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            Writing your caption and hashtags...
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption will appear here..."
              className="min-h-[88px] max-h-[140px] resize-none text-[11px] leading-snug py-2"
              maxLength={5000}
            />
            <Textarea
              value={hashtagsText}
              onChange={(e) => {
                const next = e.target.value
                  .split(/[\s,]+/)
                  .map((h) => h.replace(/^#/, "").trim())
                  .filter(Boolean);
                setHashtags(next);
              }}
              placeholder="#hashtags"
              className="min-h-[40px] max-h-[64px] resize-none text-[11px] leading-snug py-2"
              maxLength={500}
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={!caption.trim()}
                onClick={() => void copyText(caption.trim(), "Caption copied")}
              >
                <Copy className="h-3 w-3" />
                Copy caption
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={hashtags.length === 0}
                onClick={() => void copyText(hashtagsText, "Hashtags copied")}
              >
                <Copy className="h-3 w-3" />
                Copy hashtags
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={!caption.trim() && hashtags.length === 0}
                onClick={() =>
                  void copyText(
                    [caption.trim(), hashtagsText].filter(Boolean).join("\n\n"),
                    "Caption + hashtags copied"
                  )
                }
              >
                <Copy className="h-3 w-3" />
                Copy all
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Notes</p>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Optional filming notes..."
          className="min-h-[44px] max-h-[56px] resize-none text-[11px] leading-snug py-2"
          maxLength={2000}
        />
      </div>

      <div className="space-y-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8 w-full text-[11px] font-semibold"
          disabled={isSaving || captionPending}
          onClick={() => handleSave(true)}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Saving...
            </>
          ) : isSaved ? (
            "Update My Scripts"
          ) : (
            "Save to My Scripts"
          )}
        </Button>
        {!isSaved ? (
          <button
            type="button"
            className="w-full text-center text-[10px] text-muted-foreground underline underline-offset-2 disabled:opacity-50"
            disabled={isSaving || captionPending}
            onClick={() => handleSave(false)}
          >
            Save without date
          </button>
        ) : null}
      </div>

      {isSaved && postDate ? (
        <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[10px] leading-snug text-emerald-700 dark:text-emerald-300">
          Saved for {formatCoachSaveScheduleLabel(postDate, postTime)}.{" "}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={onOpenMyScripts}>
            Open in My Scripts
          </button>
        </p>
      ) : null}
    </div>
  );
}
