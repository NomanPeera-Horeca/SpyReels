import { useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Check, ChevronDown, Loader2, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  formatCurrentArtifactContext,
  formatSourceContext,
  workSummaryLabel,
  type ContentAgentArtifactContext,
  type ContentAgentTurn,
  type ContentAgentWorkEvent,
} from "@shared/contentAgentConversation";

type ContentAgentConversationProps = {
  request?: string | null;
  turns: ContentAgentTurn[];
  artifact?: ReactNode;
  artifactContext?: ContentAgentArtifactContext | null;
  workEvents?: ContentAgentWorkEvent[];
  workDurationSeconds?: number | null;
  working?: boolean;
  workingLabel?: string | null;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  /** Convenience for result-stage chat that wants this component to own input state. */
  onSend?: (value: string) => void | Promise<unknown>;
  placeholder?: string;
  disabled?: boolean;
  footer?: ReactNode;
  className?: string;
};

function AgentTurnView({ turn }: { turn: ContentAgentTurn }) {
  if (turn.role === "user") {
    return (
      <div className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-md border border-violet-500/20 bg-violet-500/10 px-4 py-2.5 text-sm leading-relaxed text-foreground">
        {turn.text}
      </div>
    );
  }

  if (turn.kind === "action_receipt") {
    return (
      <div className="max-w-[560px] rounded-xl border border-border/70 bg-card/55 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>{turn.text}</span>
        </p>
        {turn.detail ? <p className="mt-1.5 whitespace-pre-line pl-6 text-xs leading-relaxed text-muted-foreground">{turn.detail}</p> : null}
      </div>
    );
  }

  if (turn.kind === "error") {
    return (
      <div className="max-w-[620px] rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>{turn.text}</span>
        </p>
        {turn.detail ? <p className="mt-1.5 pl-6 text-xs leading-relaxed text-muted-foreground">{turn.detail}</p> : null}
      </div>
    );
  }

  return (
    <p className="max-w-[640px] text-sm leading-7 text-foreground/88">
      {turn.text}
    </p>
  );
}

function WorkSummary({
  events,
  durationSeconds,
}: {
  events: ContentAgentWorkEvent[];
  durationSeconds?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const completed = events.filter((event) => event.status === "completed").length;
  const failed = events.some((event) => event.status === "failed");

  if (events.length === 0) return null;

  return (
    <div className="max-w-[700px]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
      >
        <span className="font-medium">{workSummaryLabel(durationSeconds)}</span>
        <span>·</span>
        <span>{failed ? "Needs attention" : `${completed} steps completed`}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="mt-3 space-y-2.5 border-l border-border/80 pl-4">
          {events.map((event) => (
            <div key={event.id} className="flex items-start gap-2.5 text-sm">
              {event.status === "active" || event.status === "pending" ? (
                <Loader2 className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500", event.status === "active" && "animate-spin")} />
              ) : event.status === "failed" ? (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              )}
              <div>
                <p className="text-sm text-foreground/85">{event.label}</p>
                {event.detail ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{event.detail}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ContentAgentConversation({
  request,
  turns,
  artifact,
  artifactContext,
  workEvents = [],
  workDurationSeconds,
  working = false,
  workingLabel,
  value,
  onChange,
  onSubmit,
  onSend,
  placeholder = "Ask Agent anything about this content...",
  disabled = false,
  footer,
  className,
}: ContentAgentConversationProps) {
  const [localValue, setLocalValue] = useState("");
  const controlled = value !== undefined;
  const composerValue = controlled ? value : localValue;
  const contextLabel = useMemo(
    () => formatCurrentArtifactContext(artifactContext),
    [artifactContext]
  );
  const sourceLabel = useMemo(
    () => formatSourceContext(artifactContext),
    [artifactContext]
  );

  const changeValue = (next: string) => {
    if (controlled) onChange?.(next);
    else setLocalValue(next);
  };

  const submit = () => {
    const trimmed = composerValue.trim();
    if (!trimmed || disabled || working) return;
    if (onSubmit) onSubmit(trimmed);
    else if (onSend) void onSend(trimmed);
    if (!controlled) setLocalValue("");
  };

  return (
    <div className={cn("mx-auto w-full max-w-[900px] px-4 pb-36 pt-7 sm:px-6", className)}>
      <div className="space-y-5">
        {request?.trim() ? (
          <div className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-md border border-violet-500/20 bg-violet-500/10 px-4 py-2.5 text-sm leading-relaxed text-foreground">
            {request.trim()}
          </div>
        ) : null}

        <WorkSummary events={workEvents} durationSeconds={workDurationSeconds} />

        {artifact ? <div>{artifact}</div> : null}

        {turns.length > 0 ? (
          <div className="space-y-4">
            {turns.map((turn) => <AgentTurnView key={turn.id} turn={turn} />)}
          </div>
        ) : null}

        {working ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            <span>{workingLabel?.trim() || "Working on your content..."}</span>
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-3 z-30 mt-5 rounded-2xl border border-border/90 bg-card/95 p-2 shadow-[0_18px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        {(contextLabel || sourceLabel) ? (
          <div className="flex flex-wrap items-center gap-2 px-3 pt-2 text-[11px] text-muted-foreground">
            {contextLabel ? <span className="font-medium text-foreground/75">Current: {contextLabel}</span> : null}
            {contextLabel && sourceLabel ? <span>·</span> : null}
            {sourceLabel ? <span>Source: {sourceLabel}</span> : null}
          </div>
        ) : null}

        <Textarea
          value={composerValue}
          onChange={(event) => changeValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            submit();
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[72px] resize-none border-0 bg-transparent px-3 py-3 text-sm shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-end gap-3 px-2 pb-1">
          <button
            type="button"
            onClick={submit}
            disabled={!composerValue.trim() || disabled || working}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40"
          >
            Send <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {footer ? <div className="mt-6">{footer}</div> : null}
    </div>
  );
}
