/**
 * Renders the real Goal step, fed by the real recommendationWaitState, while a
 * scripted server status plays out (running, then the case's final status).
 * Cases (?case=...):
 *   failed      both goal attempts failed and the job reported failed
 *   unverified  both drafts were rejected; the job reported the question
 *   doneNoGoal  the status lookup missed the failed job and fell back to
 *               "done" because niche and language were saved (suspected cause)
 *   starter     a thin profile got a starter suggestion
 */
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "@/index.css";
import { GoalStep, type StepItem } from "@/components/onboarding-v2/step4";
import { recommendationWaitState } from "@/components/onboarding-v2/recommendationWait";
import { DEFAULT_GOAL_QUESTION } from "@shared/personalization/goalQuestion";
import type { GoalPayload, LanguagePayload, NichePayload } from "@shared/personalization/model";

type Status = Parameters<typeof recommendationWaitState>[0]["status"];

const kase = new URLSearchParams(location.search).get("case") ?? "failed";
const finalStatus: Status =
  kase === "failed"
    ? { state: "failed", at: 20 }
    : kase === "unverified"
      ? { state: "clarify", question: DEFAULT_GOAL_QUESTION, at: 20 }
      : { state: "done", at: 20 };

/** Saved writes, read by the test. */
const writes: unknown[] = [];
(window as unknown as { __writes: unknown[] }).__writes = writes;

function Harness() {
  const [status, setStatus] = useState<Status>({ state: "running", at: 10 });
  const [goals, setGoals] = useState<StepItem<GoalPayload>[]>(
    kase === "starter"
      ? [
          {
            id: "g1",
            payload: { text: "Share fitness tips and motivation.", starter: true },
            status: "suggested",
            evidence: "profile_inferred",
          },
        ]
      : []
  );
  // The creator already edited and confirmed these before the goal job ran.
  const [niche, setNiche] = useState<StepItem<NichePayload>>({
    id: "n1",
    payload: { slug: "houston-events", label: "Houston weekend events (my words)" },
    status: "confirmed",
    evidence: "user_provided",
  });
  const [language] = useState<StepItem<LanguagePayload>>({
    id: "l1",
    payload: { code: "en", label: "English" },
    status: "confirmed",
    evidence: "user_provided",
  });
  useEffect(() => {
    const t = window.setTimeout(() => setStatus(finalStatus), 400);
    return () => window.clearTimeout(t);
  }, []);
  const ai = useMemo(
    () =>
      recommendationWaitState({
        requested: true,
        status,
        seenAt: 10,
        waitExpired: false,
        requestFailed: false,
        statusUnreadable: false,
        // Niche and language are on screen, as in the reported run.
        hasSavedSuggestions: true,
      }),
    [status]
  );
  return (
    <>
      <div data-testid="harness-ai-state">{ai.state}</div>
      <GoalStep
        common={{
          busy: false,
          preview: null,
          fromPosts: false,
          ai,
          onBack: () => undefined,
          onSkip: () => undefined,
          onConfirm: () => undefined,
          onStepSelect: () => undefined,
          onRetryAi: () => setStatus({ state: "running", at: 30 }),
        }}
        goals={goals}
        niche={niche}
        language={language}
        onSaveGoal={async (payload, id) => {
          writes.push({ kind: "goal", payload, id });
          setGoals(g =>
            id
              ? g.map(x => (x.id === id ? { ...x, payload, status: "confirmed", evidence: "user_provided" } : x))
              : [...g, { id: `g${g.length + 2}`, payload, status: "confirmed", evidence: "user_provided" }]
          );
          return true;
        }}
        onRemoveGoal={id => setGoals(g => g.filter(x => x.id !== id))}
        onSaveNiche={async (payload, id) => {
          writes.push({ kind: "niche", payload, id });
          setNiche(n => ({ ...n, payload }));
          return true;
        }}
        onSaveLanguage={async () => true}
      />
      <Toaster />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
