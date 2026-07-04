import { useRef } from "react";
import {
  CalendarDays,
  ChevronDown,
  Loader2,
  MessageCircleQuestion,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  COACH_CAPABILITIES,
  COACH_EXAMPLE_PROMPTS,
  type CoachCapabilityId,
  type StudioPrefillMeta,
} from "@shared/studioCoachUi";
import { audienceSourceLabel } from "@shared/audienceResearch";
import { useMobileCreateAppContext } from "@/contexts/MobileCreateAppContext";

type PlanCardOption = {
  id: number;
  day: number;
  title: string;
  hook: string;
  angle: string;
  status: string;
};

type AudienceSignalOption = {
  id: number;
  source: "reddit" | "quora" | "web";
  title: string;
  snippet: string | null;
  sourceUrl: string;
};

type AiCoachCommandShellProps = {
  description: string;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  isBusy: boolean;
  attachedContext: StudioPrefillMeta | null;
  planCards: PlanCardOption[];
  audienceSignals: AudienceSignalOption[];
  audienceSignalsLoading?: boolean;
  onAttachPlanCard: (card: PlanCardOption) => void;
  onAttachAudienceSignal: (signal: AudienceSignalOption) => void;
  onClearPlanContext: () => void;
  onClearAudienceContext: () => void;
  onCapability: (id: CoachCapabilityId) => void;
  suggestions: string[];
  onSuggestionClick: (text: string) => void;
};

export function AiCoachCommandShell({
  description,
  onDescriptionChange,
  onSubmit,
  isBusy,
  attachedContext,
  planCards,
  audienceSignals,
  audienceSignalsLoading,
  onAttachPlanCard,
  onAttachAudienceSignal,
  onClearPlanContext,
  onClearAudienceContext,
  onCapability,
  suggestions,
  onSuggestionClick,
}: AiCoachCommandShellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileCreate = useMobileCreateAppContext();
  const approvedPlanCards = planCards.filter((c) => c.status === "approved");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
      <div className="mb-8 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          AI Coach
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          What do you want to create today?
        </h1>
        <p className="mt-2 text-base text-muted-foreground sm:text-lg">
          Turn any idea into a viral script you can film today.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <Textarea
          ref={textareaRef}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && description.trim() && !isBusy) {
              onSubmit();
            }
          }}
          placeholder="Describe your idea, paste a rough note, or ask for a viral script..."
          className="min-h-[120px] resize-none border-0 bg-transparent px-5 py-4 text-base shadow-none focus-visible:ring-0"
          autoFocus
        />

        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
                <Plus className="h-3.5 w-3.5" />
                Add context
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>30-day plan ideas</DropdownMenuLabel>
              {approvedPlanCards.length === 0 ? (
                <DropdownMenuItem disabled>No approved plan cards yet</DropdownMenuItem>
              ) : (
                approvedPlanCards.slice(0, 8).map((card) => (
                  <DropdownMenuItem
                    key={card.id}
                    onClick={() => onAttachPlanCard(card)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="text-xs font-medium">Day {card.day}: {card.title}</span>
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">{card.hook}</span>
                  </DropdownMenuItem>
                ))
              )}
              {planCards.length > 0 && approvedPlanCards.length === 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>All plan ideas</DropdownMenuLabel>
                  {planCards.slice(0, 6).map((card) => (
                    <DropdownMenuItem
                      key={card.id}
                      onClick={() => onAttachPlanCard(card)}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="text-xs font-medium">Day {card.day}: {card.title}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Audience questions</DropdownMenuLabel>
              {audienceSignalsLoading ? (
                <DropdownMenuItem disabled>Loading audience research...</DropdownMenuItem>
              ) : audienceSignals.length === 0 ? (
                <DropdownMenuItem disabled>No audience questions cached yet</DropdownMenuItem>
              ) : (
                audienceSignals.slice(0, 8).map((signal) => (
                  <DropdownMenuItem
                    key={signal.id}
                    onClick={() => onAttachAudienceSignal(signal)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {audienceSourceLabel(signal.source)}
                    </span>
                    <span className="line-clamp-2 text-xs font-medium">{signal.title}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {attachedContext?.planCardTitle ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
              <CalendarDays className="h-3 w-3" />
              {attachedContext.planCardDay
                ? `Day ${attachedContext.planCardDay}`
                : attachedContext.planCardTitle.slice(0, 24)}
              <button type="button" onClick={onClearPlanContext} aria-label="Remove plan context">
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}

          {attachedContext?.audienceSignalTitle ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs text-sky-700 dark:text-sky-300">
              <MessageCircleQuestion className="h-3 w-3" />
              {attachedContext.audienceSignalSource
                ? audienceSourceLabel(attachedContext.audienceSignalSource)
                : "Audience"}
              <button type="button" onClick={onClearAudienceContext} aria-label="Remove audience context">
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}

          <div className="ml-auto">
            <Button
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={onSubmit}
              disabled={!description.trim() || isBusy}
              aria-label="Write viral script"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "→"}
            </Button>
          </div>
        </div>
      </div>

      <p className="mt-2 text-right text-xs text-muted-foreground">
        {mobileCreate ? "Tap the arrow to write your script" : "Cmd + Enter to write script"}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {COACH_CAPABILITIES.map((cap) => (
          <button
            key={cap.id}
            type="button"
            onClick={() => onCapability(cap.id)}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
            title={cap.hint}
          >
            {cap.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Suggested prompts
        </p>
        {(suggestions.length ? suggestions : COACH_EXAMPLE_PROMPTS).map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSuggestionClick(prompt)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
          >
            <span className="line-clamp-2">{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
