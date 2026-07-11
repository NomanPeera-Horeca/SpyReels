import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TIME_OPTIONS } from "@/components/InlineWorkflow";
import { formatCoachSaveScheduleLabel } from "@shared/coachScriptSave";
import { cn } from "@/lib/utils";

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type CoachScriptSchedulePanelProps = {
  postDate: Date | undefined;
  onPostDateChange: (date: Date | undefined) => void;
  postTime: string;
  onPostTimeChange: (time: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  savedScriptId: number | null;
  isSaving: boolean;
  onSave: (withDate: boolean) => void;
  onOpenMyScripts: () => void;
  className?: string;
};

export function CoachScriptSchedulePanel({
  postDate,
  onPostDateChange,
  postTime,
  onPostTimeChange,
  notes,
  onNotesChange,
  savedScriptId,
  isSaving,
  onSave,
  onOpenMyScripts,
  className,
}: CoachScriptSchedulePanelProps) {
  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ") ?? "Local";
  const fromDate = startOfTodayLocal();
  const isSaved = savedScriptId != null;

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
          ? "Linked to My Scripts. Edit date or notes, then Update."
          : "Adds to My Scripts with your filming date."}
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
          disabled={isSaving}
          onClick={() => onSave(true)}
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
            disabled={isSaving}
            onClick={() => onSave(false)}
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
