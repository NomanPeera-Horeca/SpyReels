import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  RotateCcw,
  Save,
  Search,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export type SaveScriptOptions = {
  addToCalendar: boolean;
  calendarHint?: string;
};

function suggestedCalendarHint(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

type Props = {
  ideaId: number;
  title?: string | null;
  script: string;
  savedScriptId?: number | null;
  isExpanded?: boolean;
  isSavingScript?: boolean;
  onToggleExpand?: () => void;
  onSaveScript?: (opts: SaveScriptOptions) => void;
  onEditPolish?: () => void;
  onFollowUp?: (text: string) => void;
  onRegenerate?: () => void;
};

export function IdeaScriptPostPanel({
  ideaId,
  title,
  script,
  savedScriptId,
  isExpanded,
  isSavingScript,
  onToggleExpand,
  onSaveScript,
  onEditPolish,
  onFollowUp,
  onRegenerate,
}: Props) {
  const posthog = usePostHog();
  const [saved, setSaved] = useState(!!savedScriptId);
  const [thumb, setThumb] = useState<"up" | "down" | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showCalendarPrompt, setShowCalendarPrompt] = useState(false);
  const [calendarHint, setCalendarHint] = useState("");

  const followUpsQuery = trpc.ideas.getFollowUps.useQuery(
    { ideaId },
    { enabled: !!script.trim(), staleTime: 5 * 60_000 }
  );

  useEffect(() => {
    if (savedScriptId) {
      setSaved(true);
      setShowCalendarPrompt(false);
    }
  }, [savedScriptId]);

  const openCalendarPrompt = () => {
    if (saved || isSavingScript || !onSaveScript) return;
    setCalendarHint(suggestedCalendarHint());
    setShowCalendarPrompt(true);
  };

  const confirmSaveWithCalendar = () => {
    if (!onSaveScript) return;
    onSaveScript({
      addToCalendar: true,
      calendarHint: calendarHint.trim() || suggestedCalendarHint(),
    });
  };

  const confirmSaveWithoutCalendar = () => {
    if (!onSaveScript) return;
    onSaveScript({ addToCalendar: false });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(script);
    toast.success("Script copied");
  };

  const handleThumbUp = () => {
    setThumb("up");
    setShowFeedback(false);
    setFeedbackSent(false);
    posthog?.capture("idea_script_feedback", { ideaId, rating: "up" });
    toast.success("Thanks for the feedback");
  };

  const handleThumbDown = () => {
    setThumb("down");
    setShowFeedback(true);
    setFeedbackSent(false);
  };

  const submitFeedback = () => {
    posthog?.capture("idea_script_feedback", {
      ideaId,
      rating: "down",
      reason: selectedReason,
      freeText: feedbackText.trim() || undefined,
    });
    setFeedbackSent(true);
    setShowFeedback(false);
    toast.success("Got it. We will use this to improve scripts.");
  };

  const followUps = followUpsQuery.data?.followUps ?? [];

  return (
    <div className="space-y-3 w-full">
      {title ? <p className="font-semibold text-foreground">{title}</p> : null}
      <div
        className={`whitespace-pre-wrap leading-relaxed text-foreground/90 text-sm ${
          isExpanded ? "" : "line-clamp-[16]"
        }`}
      >
        {script}
      </div>
      {onToggleExpand ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? "Show less" : "Show full script"}
        </button>
      ) : null}

      <div className="flex items-center gap-0.5 pt-1">
        <button
          type="button"
          onClick={handleCopy}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Copy"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleThumbUp}
          className={`h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors ${
            thumb === "up" ? "bg-violet-50 text-violet-600" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          title="Good script"
        >
          <ThumbsUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleThumbDown}
          className={`h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors ${
            thumb === "down" ? "bg-red-50 text-red-600" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          title="Needs work"
        >
          <ThumbsDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Regenerate"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {showFeedback ? (
        <div className="rounded-xl border border-border/80 p-3.5 space-y-3">
          <p className="text-sm font-medium">What missed the mark?</p>
          <div className="flex flex-wrap gap-2">
            {["Wrong audience", "Hook too weak", "Too generic", "Wrong tone", "Too long / too short"].map(
              (reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setSelectedReason(reason)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    selectedReason === reason
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-border hover:border-violet-400"
                  }`}
                >
                  {reason}
                </button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Or tell us in your own words..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/30"
            />
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={submitFeedback}>
              Send
            </Button>
          </div>
        </div>
      ) : null}

      {feedbackSent ? (
        <p className="text-xs text-muted-foreground">Got it. We will use this to improve future scripts.</p>
      ) : null}

      {showCalendarPrompt && !saved && !savedScriptId ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Add this script to your calendar?</p>
          <p className="text-xs text-muted-foreground">
            Pick a day or date. We will save the script, tag it Scripting, schedule it, and write your caption in the
            background.
          </p>
          <input
            value={calendarHint}
            onChange={(e) => setCalendarHint(e.target.value)}
            placeholder="e.g. Thursday, March 12, or next Friday"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmSaveWithCalendar();
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700"
              onClick={confirmSaveWithCalendar}
              disabled={isSavingScript}
            >
              {isSavingScript ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              Save and schedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={confirmSaveWithoutCalendar}
              disabled={isSavingScript}
            >
              Save without calendar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCalendarPrompt(false)}
              disabled={isSavingScript}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        {saved || savedScriptId ? (
          savedScriptId ? (
            <Link href={`/scripts/${savedScriptId}`}>
              <Button size="sm" className="h-8 rounded-full text-xs bg-green-600 hover:bg-green-700 text-white">
                <Check className="h-3 w-3 mr-1.5" /> Saved to My Scripts
              </Button>
            </Link>
          ) : (
            <Button size="sm" disabled className="h-8 rounded-full text-xs bg-green-600 text-white">
              <Check className="h-3 w-3 mr-1.5" /> Saved to My Scripts
            </Button>
          )
        ) : (
          <Button
            size="sm"
            className="h-8 rounded-full text-xs bg-violet-600 hover:bg-violet-700 text-white"
            onClick={openCalendarPrompt}
            disabled={isSavingScript || showCalendarPrompt}
          >
            {isSavingScript ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
            ) : (
              <Save className="h-3 w-3 mr-1.5" />
            )}
            Save to My Scripts
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={onEditPolish}>
          <FileText className="h-3 w-3 mr-1.5" /> Edit and polish
        </Button>
        <Link href="/research">
          <Button size="sm" variant="outline" className="h-8 rounded-full text-xs">
            <Search className="h-3 w-3 mr-1.5" /> Research similar Reels
          </Button>
        </Link>
      </div>

      <div className="pt-2">
        <p className="text-sm font-semibold mb-0.5">Keep going</p>
        <p className="text-xs text-muted-foreground mb-2">Tap any prompt to write your next script</p>
        {followUpsQuery.isLoading && followUps.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
            Finding your next scripts...
          </div>
        ) : followUps.length > 0 ? (
          <div className="flex flex-col -mx-1">
            {followUps.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => onFollowUp?.(text)}
                disabled={isSavingScript}
                className="flex items-start gap-2.5 w-full py-3 px-2 text-left text-sm leading-snug text-foreground/90 hover:bg-violet-50 hover:text-violet-800 dark:hover:bg-violet-950/40 rounded-lg transition-colors group border border-transparent hover:border-violet-200/80"
              >
                <span className="text-violet-500/70 group-hover:text-violet-600 shrink-0 mt-0.5 font-medium">↳</span>
                <span className="group-hover:underline decoration-violet-300/80 underline-offset-2">{text}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-1">Next script prompts will appear here shortly.</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 pt-1">
        <CheckCircle2 className="h-3.5 w-3.5" /> Script ready
      </div>
    </div>
  );
}

export function scriptHookSnippet(script: string): string {
  const lines = script.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('"') || line.startsWith("'")) {
      return line.replace(/^["']|["']$/g, "");
    }
    if (!line.startsWith("**") && line.length > 20) {
      return line.slice(0, 120);
    }
  }
  return script.slice(0, 120);
}
