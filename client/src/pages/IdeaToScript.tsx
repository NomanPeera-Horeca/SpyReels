import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePostHog } from "@posthog/react";
import { Send, Loader2, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  isHospitalityIdea,
  isFilmingFormatWizard,
  parseClarificationWizard,
  resolveWizardSteps,
} from "@shared/ideaClarification";
import {
  buildIdeaStarterHeadline,
  buildIdeaStarterPrompts,
} from "@shared/ideaStarterPrompts";
import { ClaudeStyleQuestionCard } from "@/components/ClaudeStyleQuestionCard";
import { scriptHookSnippet } from "@/components/IdeaScriptPostPanel";
import {
  IdeaScriptConversation,
  buildInitialClarificationSession,
  advanceClarificationSession,
  retreatClarificationSession,
  getActiveClarification,
  type ClarificationSession,
} from "@/components/IdeaScriptConversation";

type ScriptEditContext = {
  ideaId: number;
  quote: string;
};

export default function IdeaToScript() {
  const posthog = usePostHog();

  const [ideaText, setIdeaText] = useState("");
  const [expandedIdea, setExpandedIdea] = useState<number | null>(null);
  const [clarifySessions, setClarifySessions] = useState<Record<number, ClarificationSession>>({});
  const [editContext, setEditContext] = useState<ScriptEditContext | null>(null);
  const [saveAssistantByIdea, setSaveAssistantByIdea] = useState<Record<number, string>>({});
  const [savingIdeaId, setSavingIdeaId] = useState<number | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();
  const onboardingQuery = trpc.onboarding.getState.useQuery();
  const suggestedPrompts = useMemo(
    () => buildIdeaStarterPrompts(onboardingQuery.data),
    [onboardingQuery.data]
  );
  const starterHeadline = useMemo(
    () => buildIdeaStarterHeadline(onboardingQuery.data),
    [onboardingQuery.data]
  );
  const ideasQuery = trpc.ideas.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasPending = data.some((i: any) =>
        ["queued", "processing", "validating", "awaiting_approval"].includes(i.status)
      );
      return hasPending ? 3000 : false;
    },
  });

  const submitMutation = trpc.ideas.submit.useMutation({
    onSuccess: () => {
      setIdeaText("");
      setEditContext(null);
      utils.ideas.list.invalidate();
      textareaRef.current?.focus();
    },
    onError: (err) => toast.error(err.message),
  });

  const approveMutation = trpc.ideas.approve.useMutation({
    onSuccess: (_data, variables) => {
      if (variables.action === "clarify") {
        setClarifySessions((prev) => {
          const next = { ...prev };
          delete next[variables.ideaId];
          return next;
        });
      }
      utils.ideas.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.ideas.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.ideas.list.cancel();
      const prev = utils.ideas.list.getData();
      utils.ideas.list.setData(undefined, (old) => old?.filter((i) => i.id !== id));
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) utils.ideas.list.setData(undefined, context.prev);
    },
    onSettled: () => utils.ideas.list.invalidate(),
  });

  const retryMutation = trpc.ideas.retry.useMutation({
    onSuccess: () => utils.ideas.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const saveToScriptsMutation = trpc.ideas.saveToScripts.useMutation({
    onMutate: ({ ideaId }) => {
      setSavingIdeaId(ideaId);
    },
    onSuccess: (data, variables) => {
      if (data.assistantMessage) {
        setSaveAssistantByIdea((prev) => ({ ...prev, [variables.ideaId]: data.assistantMessage }));
      }
      utils.ideas.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setSavingIdeaId(null),
  });

  const ideas = ideasQuery.data || [];

  const sortedIdeas = useMemo(
    () => [...ideas].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [ideas]
  );

  const activeClarify = useMemo(
    () => getActiveClarification(sortedIdeas as any[], clarifySessions),
    [sortedIdeas, clarifySessions]
  );

  const latestCompletedIdea = useMemo(
    () => [...sortedIdeas].reverse().find((i) => i.status === "completed" && i.generatedScript),
    [sortedIdeas]
  );

  useEffect(() => {
    setClarifySessions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const idea of ideas) {
        if (idea.status !== "awaiting_approval") {
          if (next[idea.id] && !approveMutation.isPending) {
            delete next[idea.id];
            changed = true;
          }
          continue;
        }
        const wizard = parseClarificationWizard((idea as any).viralStructure);
        if (wizard && !next[idea.id]) {
          next[idea.id] = buildInitialClarificationSession();
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ideas, approveMutation.isPending]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ideas, clarifySessions, approveMutation.isPending, activeClarify?.stepIndex, editContext]);

  const handlePickOption = (ideaId: number, optionId: string, customText?: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    const wizard = idea ? parseClarificationWizard((idea as any).viralStructure) : null;
    const session = clarifySessions[ideaId];
    if (!wizard || !session) return;

    const activeSteps = resolveWizardSteps(wizard, session.answers);
    const step = activeSteps[session.stepIndex];
    if (!step) return;

    const answerId = customText?.trim() || optionId;
    const { next, done, allAnswers } = advanceClarificationSession(session, wizard, step, answerId);
    setClarifySessions((prev) => ({ ...prev, [ideaId]: next }));

    if (done) {
      approveMutation.mutate({
        ideaId,
        action: "clarify",
        clarificationAnswers: allAnswers,
        clarificationCustom: customText?.trim() || undefined,
      });
    }
  };

  const handleSkipClarification = (ideaId: number) => {
    const idea = ideas.find((i) => i.id === ideaId);
    const wizard = idea ? parseClarificationWizard((idea as any).viralStructure) : null;
    if (wizard && isFilmingFormatWizard(wizard)) {
      setClarifySessions((prev) => {
        const next = { ...prev };
        delete next[ideaId];
        return next;
      });
      approveMutation.mutate({
        ideaId,
        action: "clarify",
        clarificationAnswers: { filming_format: "talking_head" },
      });
      return;
    }

    const defaultAudience = idea && isHospitalityIdea(idea.idea) ? "guests" : "customers";
    setClarifySessions((prev) => {
      const next = { ...prev };
      delete next[ideaId];
      return next;
    });
    approveMutation.mutate({
      ideaId,
      action: "clarify",
      clarificationAnswers: { audience: defaultAudience },
    });
  };

  const handleClarifyBack = () => {
    if (!activeClarify) return;
    const { idea, wizard, session } = activeClarify;
    const prev = retreatClarificationSession(session, wizard);
    if (prev) setClarifySessions((s) => ({ ...s, [idea.id]: prev }));
  };

  const wrapScriptForEdit = (idea: { id: number; generatedScript?: string | null }, prefill = "") => {
    if (!idea.generatedScript) return;
    setEditContext({
      ideaId: idea.id,
      quote: scriptHookSnippet(idea.generatedScript),
    });
    setIdeaText(prefill);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSubmit = () => {
    const trimmed = ideaText.trim();
    if (!trimmed) return;

    if (editContext) {
      posthog?.capture("idea_script_revision_request", {
        ideaId: editContext.ideaId,
        request: trimmed,
      });
      toast.message("Script revision queued", {
        description: "In-app revisions are coming soon. Your feedback was recorded.",
      });
      setIdeaText("");
      setEditContext(null);
      return;
    }

    if (activeClarify) {
      handlePickOption(activeClarify.idea.id, trimmed, trimmed);
      setIdeaText("");
      return;
    }

    submitMutation.mutate({
      idea: trimmed,
      niche: undefined,
      tone: "engaging" as any,
      creatorGoal: "balanced" as any,
      gradeLevel: "auto" as any,
      inputMethod: "text",
    });
    posthog?.capture("idea_to_script_submit");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (activeClarify || editContext) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const chatTitle =
    sortedIdeas.length > 0
      ? ideaUserPrompt(sortedIdeas[sortedIdeas.length - 1].idea).slice(0, 48)
      : "New script";

  const composerPlaceholder = editContext
    ? "Describe what to change..."
    : activeClarify
    ? "Or reply directly..."
    : latestCompletedIdea
    ? "Ask for changes, a shorter hook, or describe your next Reel idea..."
    : "Describe your Reel idea...";

  const composerHint = editContext
    ? "Your edit applies to the quoted script above"
    : activeClarify
    ? ""
    : latestCompletedIdea
    ? "Type a revision or tap a follow-up above"
    : "";

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] w-full bg-background overflow-hidden">
      <div className="shrink-0 px-4 py-3 text-center">
        <h1 className="text-sm font-medium text-foreground truncate max-w-md mx-auto inline-flex items-center gap-1">
          {chatTitle}
          <span className="text-muted-foreground text-xs">▾</span>
        </h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          {ideasQuery.isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : sortedIdeas.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Lightbulb className="h-6 w-6 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-medium mb-2">{starterHeadline}</h2>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                Describe your idea below. I will ask a few smart questions before drafting a script built to go viral.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-md">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setIdeaText(prompt)}
                    className="rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-left text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedIdeas.map((idea) => (
                <IdeaScriptConversation
                  key={idea.id}
                  idea={idea as any}
                  session={clarifySessions[idea.id] ?? null}
                  isExpanded={expandedIdea === idea.id}
                  onToggleExpand={() =>
                    setExpandedIdea((id) => (id === idea.id ? null : idea.id))
                  }
                  onRetry={(id) => retryMutation.mutate({ id })}
                  onDelete={(id) => deleteMutation.mutate({ id })}
                  onSaveScript={(ideaId, opts) =>
                    saveToScriptsMutation.mutate({
                      ideaId,
                      addToCalendar: opts.addToCalendar,
                      calendarHint: opts.calendarHint,
                    })
                  }
                  isSavingScript={saveToScriptsMutation.isPending && savingIdeaId === idea.id}
                  saveAssistantMessage={saveAssistantByIdea[idea.id] ?? null}
                  onEditPolish={(i) => wrapScriptForEdit(i)}
                  onFollowUp={(_i, text) => {
                    posthog?.capture("idea_follow_up_submit", {
                      followUp: text.slice(0, 120),
                    });
                    submitMutation.mutate({
                      idea: text,
                      niche: undefined,
                      tone: "engaging" as any,
                      creatorGoal: "balanced" as any,
                      gradeLevel: "auto" as any,
                      inputMethod: "text",
                    });
                  }}
                  onRegenerate={(i) =>
                    wrapScriptForEdit(i, "Regenerate the full script with a stronger hook and tighter pacing")
                  }
                />
              ))}
            </div>
          )}
          <div ref={threadEndRef} className="h-8" />
        </div>
      </div>

      <div className="shrink-0 bg-background px-4 sm:px-6 py-4 max-h-[min(52vh,520px)] overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-3">
          {activeClarify ? (
            <ClaudeStyleQuestionCard
              question={activeClarify.step.question}
              stepIndex={activeClarify.stepIndex}
              totalSteps={activeClarify.totalSteps}
              options={activeClarify.step.options}
              allowCustom={activeClarify.step.allowCustom}
              disabled={approveMutation.isPending}
              onPick={(id) => handlePickOption(activeClarify.idea.id, id)}
              onCustom={(t) => handlePickOption(activeClarify.idea.id, t, t)}
              onSkip={() => handleSkipClarification(activeClarify.idea.id)}
              onBack={activeClarify.stepIndex > 0 ? handleClarifyBack : undefined}
              onDismiss={() => handleSkipClarification(activeClarify.idea.id)}
            />
          ) : null}

          <div className="rounded-[22px] border border-border/60 bg-card transition-colors focus-within:border-violet-400/35 focus-within:ring-[3px] focus-within:ring-violet-400/10">
            {editContext ? (
              <div className="mx-2.5 mt-2.5 px-3 py-2.5 rounded-xl bg-muted/80 border border-border/60 relative">
                <button
                  type="button"
                  onClick={() => setEditContext(null)}
                  className="absolute top-2 right-2 h-5 w-5 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  aria-label="Remove script context"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Editing script
                </p>
                <p className="text-sm text-muted-foreground line-clamp-3 pr-6">&ldquo;{editContext.quote}&rdquo;</p>
              </div>
            ) : null}

            <Textarea
              ref={textareaRef}
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={composerPlaceholder}
              rows={editContext ? 2 : 1}
              className="min-h-[52px] max-h-32 resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
            />
            <div className="flex items-center justify-end gap-2 px-3 pb-3">
              <Button
                onClick={handleSubmit}
                disabled={
                  !ideaText.trim() ||
                  submitMutation.isPending ||
                  approveMutation.isPending
                }
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                {submitMutation.isPending || approveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {composerHint ? (
            <p className="text-center text-[11px] text-muted-foreground/75">{composerHint}</p>
          ) : null}
          <p className="text-center text-[10px] text-muted-foreground/70">
            <span className="text-violet-600 font-medium">SpyReels</span> asks smart questions so your script hits the
            right audience and goes viral.
          </p>
        </div>
      </div>
    </div>
  );
}

function ideaUserPrompt(text: string): string {
  const base = text.split("\n\nCreator context:")[0]?.trim();
  return base || text.trim();
}
