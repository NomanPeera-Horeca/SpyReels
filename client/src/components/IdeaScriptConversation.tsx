import { type ReactNode } from "react";
import { Loader2, RotateCcw, Sparkles, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  labelForWizardAnswer,
  parseClarificationWizard,
  readClarificationSummary,
  resolveWizardSteps,
  wizardStepCount,
  type ClarificationStep,
  type IdeaClarificationWizard,
} from "@shared/ideaClarification";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";
import { IdeaScriptPostPanel, type SaveScriptOptions } from "@/components/IdeaScriptPostPanel";
import { IdeaScriptProgressPanel } from "@/components/IdeaScriptProgressPanel";

export type ChatTurn = { role: "user"; content: string };

export type ClarificationSession = {
  stepIndex: number;
  answers: Record<string, string>;
  turns: ChatTurn[];
};

type IdeaLike = {
  id: number;
  idea: string;
  status: string;
  createdAt: Date | string;
  generatedTitle?: string | null;
  generatedScript?: string | null;
  savedScriptId?: number | null;
  errorMessage?: string | null;
  viralStructure?: unknown;
  viralScore?: number | null;
  filmingFormat?: string | null;
};

export type ActiveClarification = {
  idea: IdeaLike;
  wizard: IdeaClarificationWizard;
  session: ClarificationSession;
  step: ClarificationStep;
  stepIndex: number;
  totalSteps: number;
};

type Props = {
  idea: IdeaLike;
  session: ClarificationSession | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onRetry?: (id: number) => void;
  onDelete?: (id: number) => void;
  onSaveScript?: (ideaId: number, opts: SaveScriptOptions) => void;
  isSavingScript?: boolean;
  saveAssistantMessage?: string | null;
  onEditPolish?: (idea: IdeaLike) => void;
  onFollowUp?: (idea: IdeaLike, text: string) => void;
  onRegenerate?: (idea: IdeaLike) => void;
};

function ideaUserPrompt(text: string): string {
  const base = text.split("\n\nCreator context:")[0]?.trim();
  return base || text.trim();
}

function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 items-start max-w-full py-1">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 border border-violet-200/80 mt-0.5">
        <Sparkles className="h-3.5 w-3.5 text-violet-600" />
      </div>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-foreground pt-0.5">{children}</div>
    </div>
  );
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end py-1">
      <div className="max-w-[85%] rounded-[22px] border border-border/60 bg-muted/80 px-4 py-2.5 text-sm leading-relaxed text-foreground">
        {children}
      </div>
    </div>
  );
}

function QaSummaryBubble({ items }: { items: Array<{ question: string; answer: string }> }) {
  return (
    <UserBubble>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.question} className={i > 0 ? "pt-3 border-t border-border/60" : ""}>
            <p className="text-[13px] font-semibold">Q: {item.question}</p>
            <p className="text-sm mt-0.5">A: {item.answer}</p>
          </div>
        ))}
      </div>
    </UserBubble>
  );
}

function buildSessionSummary(
  wizard: IdeaClarificationWizard,
  session: ClarificationSession
): Array<{ question: string; answer: string }> {
  const steps = resolveWizardSteps(wizard, session.answers);
  return steps
    .map((step) => {
      const raw = session.answers[step.id];
      if (!raw?.trim()) return null;
      return { question: step.question, answer: labelForWizardAnswer(step, raw) };
    })
    .filter((x): x is { question: string; answer: string } => !!x);
}

export function buildInitialClarificationSession(): ClarificationSession {
  return { stepIndex: 0, answers: {}, turns: [] };
}

export function getActiveClarification(
  ideas: IdeaLike[],
  sessions: Record<number, ClarificationSession>
): ActiveClarification | null {
  for (let i = ideas.length - 1; i >= 0; i--) {
    const idea = ideas[i];
    if (idea.status !== "awaiting_approval") continue;
    const wizard = parseClarificationWizard(idea.viralStructure);
    const session = sessions[idea.id];
    if (!wizard || !session) continue;
    const activeSteps = resolveWizardSteps(wizard, session.answers);
    const step = activeSteps[session.stepIndex];
    if (!step) continue;
    return {
      idea,
      wizard,
      session,
      step,
      stepIndex: session.stepIndex,
      totalSteps: wizardStepCount(wizard, session.answers),
    };
  }
  return null;
}

export function IdeaScriptConversation({
  idea,
  session,
  isExpanded,
  onToggleExpand,
  onRetry,
  onDelete,
  onSaveScript,
  isSavingScript,
  saveAssistantMessage,
  onEditPolish,
  onFollowUp,
  onRegenerate,
}: Props) {
  const wizard = parseClarificationWizard(idea.viralStructure);
  const isAwaiting = idea.status === "awaiting_approval" && !!wizard;
  const storedSummary = readClarificationSummary(idea.viralStructure);
  const prompt = ideaUserPrompt(idea.idea);

  const sessionSummary =
    wizard && session && session.turns.length > 0 ? buildSessionSummary(wizard, session) : null;
  const showSessionSummary =
    sessionSummary &&
    sessionSummary.length > 0 &&
    wizard &&
    session &&
    session.stepIndex >= resolveWizardSteps(wizard, session.answers).length;

  return (
    <div className="space-y-1">
      <UserBubble>{prompt}</UserBubble>

      {storedSummary && !session ? <QaSummaryBubble items={storedSummary} /> : null}

      {showSessionSummary && sessionSummary ? <QaSummaryBubble items={sessionSummary} /> : null}

      {(idea.status === "validating" || idea.status === "queued") && (
        <AssistantRow>
          <IdeaScriptProgressPanel
            status={idea.status === "queued" ? "validating" : idea.status}
            viralStructure={idea.viralStructure}
          />
        </AssistantRow>
      )}

      {isAwaiting && !session && (
        <AssistantRow>
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
            Thinking...
          </span>
        </AssistantRow>
      )}

      {idea.status === "processing" && (
        <AssistantRow>
          <IdeaScriptProgressPanel status="processing" viralStructure={idea.viralStructure} />
        </AssistantRow>
      )}

      {idea.status === "failed" && (
        <AssistantRow>
          <span className="inline-flex items-start gap-2 text-red-500">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {formatIdeaScriptErrorForUser(idea.errorMessage, "validation")}
          </span>
          {onRetry ? (
            <div className="mt-3">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onRetry(idea.id)}>
                <RotateCcw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          ) : null}
        </AssistantRow>
      )}

      {idea.status === "completed" && idea.generatedScript ? (
        <>
          <AssistantRow>
            <IdeaScriptPostPanel
              ideaId={idea.id}
              title={idea.generatedTitle}
              script={idea.generatedScript}
              savedScriptId={idea.savedScriptId}
              isExpanded={isExpanded}
              isSavingScript={isSavingScript}
              onToggleExpand={onToggleExpand}
              onSaveScript={
                onSaveScript ? (opts) => onSaveScript(idea.id, opts) : undefined
              }
              onEditPolish={onEditPolish ? () => onEditPolish(idea) : undefined}
              onFollowUp={onFollowUp ? (text) => onFollowUp(idea, text) : undefined}
              onRegenerate={onRegenerate ? () => onRegenerate(idea) : undefined}
            />
          </AssistantRow>
          {saveAssistantMessage ? (
            <AssistantRow>
              <p className="text-sm text-foreground/90 leading-relaxed">{saveAssistantMessage}</p>
            </AssistantRow>
          ) : null}
        </>
      ) : null}

      {(idea.status === "completed" || idea.status === "failed") && onDelete ? (
        <div className="flex justify-end pb-4">
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this conversation?")) onDelete(idea.id);
            }}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function advanceClarificationSession(
  session: ClarificationSession,
  wizard: IdeaClarificationWizard,
  step: ClarificationStep,
  answerId: string
): { next: ClarificationSession; done: boolean; allAnswers: Record<string, string> } {
  const nextAnswers = { ...session.answers, [step.id]: answerId };
  const nextActive = resolveWizardSteps(wizard, nextAnswers);
  const nextIndex = session.stepIndex + 1;

  if (nextIndex >= nextActive.length) {
    return {
      done: true,
      allAnswers: nextAnswers,
      next: {
        ...session,
        answers: nextAnswers,
        turns: session.turns,
        stepIndex: nextIndex,
      },
    };
  }

  return {
    done: false,
    allAnswers: nextAnswers,
    next: {
      stepIndex: nextIndex,
      answers: nextAnswers,
      turns: session.turns,
    },
  };
}

export function retreatClarificationSession(
  session: ClarificationSession,
  wizard: IdeaClarificationWizard
): ClarificationSession | null {
  if (session.stepIndex <= 0) return null;

  const prevStepIndex = session.stepIndex - 1;
  const activeSteps = resolveWizardSteps(wizard, session.answers);
  const stepToUndo = activeSteps[prevStepIndex];
  const nextAnswers = { ...session.answers };
  if (stepToUndo) delete nextAnswers[stepToUndo.id];

  return {
    stepIndex: prevStepIndex,
    answers: nextAnswers,
    turns: session.turns,
  };
}
