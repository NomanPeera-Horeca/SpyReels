import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { STUDIO_PREFILL_KEY } from "@shared/studioHeit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

type GeneratedScript = {
  id: number;
  title: string;
  hook: string;
  body: string;
  callToAction: string;
  platform: string;
  tone: string;
  estimatedDuration: string | null;
  contentType: string | null;
  contentFormat: string | null;
  formatLabel: string | null;
  productionNotes: string | null;
};

type FactCheck = {
  hasClaim: boolean;
  status: string;
  claimSummary: string | null;
  warning: string | null;
  safeAngle: string | null;
};

type AnalysisResult = {
  confidence: number;
  understood: string;
  gaps: string[];
  questions: string[];
  factCheck?: FactCheck;
};

type Phase = "idle" | "analyzing" | "clarifying" | "generating" | "result";

const EXAMPLE_PROMPTS = [
  "I just got a testimonial from a client who lost 22kg using my program. Turn this into a reel.",
  "I want to make a video about why counting calories is a waste of time and what you should do instead",
  "I went behind the scenes at a top hotel kitchen last night. The things I saw were wild.",
  "My client doubled her revenue in 90 days by doing ONE thing differently. I want to talk about it.",
];

export default function AiCoach() {
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [clarifications, setClarifications] = useState<{ question: string; answer: string }[]>([]);
  const [result, setResult] = useState<GeneratedScript | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState({ hook: "", body: "", callToAction: "" });
  const [refineInput, setRefineInput] = useState("");
  const [hookVariations, setHookVariations] = useState<{
    context: string;
    contrarian: string;
    intrigue: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const prefill = sessionStorage.getItem(STUDIO_PREFILL_KEY);
    if (prefill) {
      setDescription(prefill);
      sessionStorage.removeItem(STUDIO_PREFILL_KEY);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, []);

  const generateMutation = trpc.studio.generate.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setEditDraft({ hook: data.hook, body: data.body, callToAction: data.callToAction });
      setPhase("result");
    },
    onError: (err) => {
      toast.error(err.message);
      setPhase("idle");
    },
  });

  const analyzeMutation = trpc.studio.analyze.useMutation({
    onSuccess: (data) => {
      setAnalysis(data);
      const hasQ = data.questions?.length > 0;
      const hasBadFact =
        data.factCheck?.hasClaim &&
        ["viral_rumor", "likely_false", "satire"].includes(data.factCheck.status);
      if (hasQ || hasBadFact) {
        setClarifications((data.questions ?? []).map((q) => ({ question: q, answer: "" })));
        setPhase("clarifying");
      } else {
        setPhase("generating");
        generateMutation.mutate({ description, clarifications: [] });
      }
    },
    onError: (err) => {
      toast.error(err.message || "Could not analyze your idea. Trying to write anyway...");
      setPhase("generating");
      generateMutation.mutate({ description, clarifications: [] });
    },
  });

  const refineMutation = trpc.studio.refine.useMutation({
    onSuccess: (data) => {
      if (!result) return;
      setResult({ ...result, ...data });
      setEditDraft({ hook: data.hook, body: data.body, callToAction: data.callToAction });
      setRefineInput("");
    },
    onError: (err) => toast.error(err.message),
  });

  const hookVariationsMutation = trpc.studio.hookVariations.useMutation({
    onSuccess: setHookVariations,
    onError: (err) => toast.error(err.message),
  });

  const applyHookMutation = trpc.studio.applyHook.useMutation({
    onSuccess: (data) => {
      if (!result) return;
      setResult({ ...result, hook: data.hook });
      setEditDraft((d) => ({ ...d, hook: data.hook }));
      setHookVariations(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const reset = () => {
    setPhase("idle");
    setDescription("");
    setAnalysis(null);
    setClarifications([]);
    setResult(null);
    setEditMode(false);
    setHookVariations(null);
  };

  const startAnalyze = () => {
    const trimmed = description.trim();
    if (!trimmed) return;
    setPhase("analyzing");
    analyzeMutation.mutate({ description: trimmed });
  };

  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 sm:px-6">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              <Sparkles className="h-4 w-4" />
              AI Personal Brand Coach
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">What do you want to say?</h1>
            <p className="text-muted-foreground text-base sm:text-lg">
              Dump your raw idea. I will research it first, then write your HEIT script.
            </p>
          </div>

          <div className="relative mb-4">
            <Textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && description.trim()) {
                  startAnalyze();
                }
              }}
              placeholder="e.g. My client just got a 5-star review. I want to make a reel about it."
              className="min-h-[140px] px-5 py-4 pr-16 text-base rounded-2xl resize-none"
              autoFocus
            />
            <Button
              type="button"
              size="icon"
              className="absolute bottom-4 right-4 rounded-xl bg-violet-600 hover:bg-violet-700"
              onClick={startAnalyze}
              disabled={!description.trim() || analyzeMutation.isPending}
            >
              →
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-right mb-6">Cmd + Enter to generate</p>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Try an example
            </p>
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setDescription(prompt);
                  textareaRef.current?.focus();
                }}
                className="w-full text-left px-4 py-3 rounded-xl border border-border bg-card hover:border-violet-300 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all text-sm text-muted-foreground hover:text-foreground"
              >
                <span className="line-clamp-2">{prompt}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "analyzing" || phase === "generating") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
        <div className="w-full max-w-2xl">
          <div className="bg-card border border-border rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
              <div>
                <p className="font-semibold">
                  {phase === "analyzing" ? "Researching your idea..." : "Writing your script..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {phase === "analyzing" ? "Checking context before writing" : "Building your HEIT script"}
                </p>
              </div>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4 italic line-clamp-2">
            &ldquo;{description.slice(0, 80)}
            {description.length > 80 ? "..." : ""}&rdquo;
          </p>
        </div>
      </div>
    );
  }

  if (phase === "clarifying" && analysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
        <div className="w-full max-w-2xl space-y-4">
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-5">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Here&apos;s what I understood
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">{analysis.understood}</p>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex-1 h-1.5 bg-blue-200 dark:bg-blue-900 rounded-full">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${analysis.confidence}%` }} />
              </div>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{analysis.confidence}% confident</span>
            </div>
          </div>

          {analysis.factCheck?.warning && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100">
              {analysis.factCheck.warning}
            </div>
          )}

          {clarifications.map((c, i) => (
            <div key={c.question} className="bg-card border border-border rounded-2xl p-5">
              <p className="text-sm font-semibold mb-2">{c.question}</p>
              <Textarea
                value={c.answer}
                onChange={(e) =>
                  setClarifications((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x))
                  )
                }
                placeholder="Your answer..."
                className="min-h-[80px] resize-none"
                autoFocus={i === 0}
              />
            </div>
          ))}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setPhase("generating");
                generateMutation.mutate({ description, clarifications: [] });
              }}
            >
              Skip
            </Button>
            <Button
              className="flex-1 bg-violet-600 hover:bg-violet-700"
              onClick={() => {
                setPhase("generating");
                generateMutation.mutate({ description, clarifications });
              }}
            >
              Write my script
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "result" && result) {
    return (
      <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold">{result.title}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {result.formatLabel && (
                <span className="text-[11px] font-bold bg-violet-100 dark:bg-violet-950/50 text-violet-800 dark:text-violet-200 px-2 py-0.5 rounded-full">
                  {result.formatLabel}
                </span>
              )}
              <span className="text-[11px] bg-muted px-2 py-0.5 rounded-full capitalize">{result.platform}</span>
              {result.estimatedDuration && (
                <span className="text-xs text-muted-foreground">{result.estimatedDuration}</span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            New idea
          </Button>
        </div>

        <div className="rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-bold font-mono text-blue-700">
              H
            </div>
            <span className="font-semibold text-sm text-blue-700 dark:text-blue-300">Hook</span>
          </div>
          {editMode ? (
            <Textarea
              value={editDraft.hook}
              onChange={(e) => setEditDraft((d) => ({ ...d, hook: e.target.value }))}
              className="min-h-[60px] resize-none"
            />
          ) : (
            <p className="text-sm leading-relaxed font-medium">{result.hook}</p>
          )}
          {!editMode && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mt-3 px-0 text-blue-600"
              onClick={() => hookVariationsMutation.mutate({ id: result.id })}
              disabled={hookVariationsMutation.isPending}
            >
              {hookVariationsMutation.isPending ? "Generating..." : "Try 3 alternative hooks"}
            </Button>
          )}
          {hookVariations && (
            <div className="mt-3 space-y-2">
              {Object.entries(hookVariations).map(([type, text]) => (
                <div key={type} className="flex items-start gap-2 p-3 bg-card border border-blue-200 rounded-xl">
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">{type}</p>
                    <p className="text-sm">{text}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyHookMutation.mutate({ id: result.id, hook: text })}
                  >
                    Use
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setHookVariations(null)}>
                Dismiss
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-xs font-bold font-mono">
              E→I
            </div>
            <span className="font-semibold text-sm">Explain + Illustrate</span>
          </div>
          {editMode ? (
            <Textarea
              value={editDraft.body}
              onChange={(e) => setEditDraft((d) => ({ ...d, body: e.target.value }))}
              className="min-h-[160px] resize-none"
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-line">{result.body}</p>
          )}
        </div>

        <div className="rounded-2xl border border-orange-200 dark:border-orange-800 bg-orange-50/20 dark:bg-orange-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900 flex items-center justify-center text-xs font-bold font-mono text-orange-700">
              T
            </div>
            <span className="font-semibold text-sm text-orange-700 dark:text-orange-300">Teach</span>
          </div>
          {editMode ? (
            <Textarea
              value={editDraft.callToAction}
              onChange={(e) => setEditDraft((d) => ({ ...d, callToAction: e.target.value }))}
              className="min-h-[60px] resize-none"
            />
          ) : (
            <p className="text-sm leading-relaxed font-medium">{result.callToAction}</p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {editMode ? (
            <>
              <Button
                className="bg-violet-600 hover:bg-violet-700"
                onClick={() => {
                  setResult({ ...result, ...editDraft });
                  setEditMode(false);
                }}
              >
                Save edits
              </Button>
              <Button variant="outline" onClick={() => setEditMode(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditMode(true)}>
                Edit manually
              </Button>
            </>
          )}
        </div>

        <div>
          <Input
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && refineInput.trim()) {
                refineMutation.mutate({ id: result.id, instruction: refineInput });
              }
            }}
            placeholder='e.g. "Make the hook more contrarian"'
          />
          {refineInput.trim() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => refineMutation.mutate({ id: result.id, instruction: refineInput })}
              disabled={refineMutation.isPending}
            >
              {refineMutation.isPending ? "Refining..." : "Refine with AI"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
