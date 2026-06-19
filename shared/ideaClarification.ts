/** Structured clarification wizard stored on script_ideas.viralStructure */

export type ClarificationOption = {
  id: string;
  label: string;
  sub?: string;
};

export type ClarificationStep = {
  id: string;
  question: string;
  options: ClarificationOption[];
  allowCustom: boolean;
};

export type IdeaClarificationWizard = {
  version: 1;
  steps: ClarificationStep[];
};

export type ClarificationAudienceType = "b2c" | "b2b" | "creator_peers" | "other";

const HOSPITALITY_RE =
  /\b(guest|hotel|resort|hospitality|check-in|checkout|restaurant|cafe|diner|venue|airbnb|bnb|stay|lodging|traveler|traveller|tourist)\b/i;

export function isHospitalityIdea(text: string): boolean {
  return HOSPITALITY_RE.test(text);
}

export function readClarificationSummary(
  viralStructure: unknown
): Array<{ question: string; answer: string }> | null {
  if (!viralStructure || typeof viralStructure !== "object") return null;
  const meta = (viralStructure as Record<string, unknown>).ideaMeta;
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).clarificationAnswers;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Array<{ question: string; answer: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const q = (item as Record<string, unknown>).question;
    const a = (item as Record<string, unknown>).answer;
    if (typeof q === "string" && typeof a === "string" && a.trim()) {
      out.push({ question: q.trim(), answer: a.trim() });
    }
  }
  return out.length > 0 ? out : null;
}

export function readFollowUpsFromIdeaMeta(viralStructure: unknown): string[] | null {
  if (!viralStructure || typeof viralStructure !== "object") return null;
  const meta = (viralStructure as Record<string, unknown>).ideaMeta;
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).followUps;
  if (!Array.isArray(raw)) return null;
  const items = raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, 3);
  return items.length > 0 ? items : null;
}

export function ideaHasLockedAudience(idea: {
  idea: string;
  viralStructure?: unknown;
}): boolean {
  if (readTargetAudienceFromIdeaMeta(idea.viralStructure)) return true;
  return /\nTarget audience:/i.test(idea.idea) || /\nCreator context:/i.test(idea.idea);
}

/** Steps shown after prior answers (e.g. skip guest journey for B2B audience). */
export function resolveWizardSteps(
  wizard: IdeaClarificationWizard,
  answers: Record<string, string>
): ClarificationStep[] {
  const audienceId = answers.audience?.trim();
  if (!audienceId) {
    return wizard.steps;
  }
  const audType = audienceTypeFromAnswer(audienceId);
  return wizard.steps.filter((step) => {
    if (step.id === "journey_moment") return audType === "b2c";
    if (step.id === "venue_type") return audType === "b2c" || audType === "b2b";
    return true;
  });
}

/** Step count for progress UI (full path until audience is chosen, then filtered). */
export function wizardStepCount(
  wizard: IdeaClarificationWizard,
  answers: Record<string, string>
): number {
  return resolveWizardSteps(wizard, answers).length;
}

export function labelForWizardAnswer(step: ClarificationStep, answerId: string): string {
  const opt = step.options.find((o) => o.id === answerId);
  return opt?.label ?? answerId;
}

const B2B_HOOK_RE =
  /\b(owner|operator|manager|revpar|occupancy|your team|staff|pms|property manager|hospitality business)\b/i;
const B2C_HOOK_RE =
  /\b(you |your stay|when you|guest|traveler|traveller|diner|booking|check.?in|visit us|our hotel)\b/i;

/** Prefer hooks that match the locked audience type when pulling viral examples. */
export function hookMatchesAudienceType(
  hook: string,
  audienceType: ClarificationAudienceType | null | undefined
): boolean {
  if (!audienceType || audienceType === "other" || audienceType === "creator_peers") return true;
  const hasB2b = B2B_HOOK_RE.test(hook);
  const hasB2c = B2C_HOOK_RE.test(hook);
  if (audienceType === "b2c") return hasB2c || !hasB2b;
  if (audienceType === "b2b") return hasB2b || !hasB2c;
  return true;
}

export function rankHooksForAudience<
  T extends { hook: string; pattern: string; skipRate: number | null }
>(hooks: T[], audienceType: ClarificationAudienceType | null | undefined): T[] {
  if (!audienceType || audienceType === "other") return hooks;
  const matched = hooks.filter((h) => hookMatchesAudienceType(h.hook, audienceType));
  const rest = hooks.filter((h) => !hookMatchesAudienceType(h.hook, audienceType));
  return [...matched, ...rest];
}

export function parseClarificationWizard(viralStructure: unknown): IdeaClarificationWizard | null {
  if (!viralStructure || typeof viralStructure !== "object") return null;
  const raw = (viralStructure as Record<string, unknown>).clarification;
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  if (!Array.isArray(w.steps) || w.steps.length === 0) return null;
  return { version: 1, steps: w.steps as ClarificationStep[] };
}

export function buildClarificationWizard(
  ideaText: string,
  aiQuestion?: string | null
): IdeaClarificationWizard {
  const hospitality = isHospitalityIdea(ideaText);

  const audienceStep: ClarificationStep = hospitality
    ? {
        id: "audience",
        question: aiQuestion?.trim() || "Who is the target audience?",
        options: [
          {
            id: "guests",
            label: "End guests, diners, or travelers",
            sub: "People experiencing your place (B2C)",
          },
          {
            id: "operators",
            label: "Restaurant or hotel owners and operators",
            sub: "Hospitality buyers and managers (B2B)",
          },
          {
            id: "creator_peers",
            label: "Other creators and marketers in hospitality",
            sub: "Peers learning content and growth",
          },
        ],
        allowCustom: true,
      }
    : {
        id: "audience",
        question: aiQuestion?.trim() || "Who will watch this Reel?",
        options: [
          {
            id: "customers",
            label: "My customers or audience",
            sub: "People who buy from or follow me as a consumer",
          },
          {
            id: "operators",
            label: "Other business owners or professionals",
            sub: "Peers or buyers in my industry",
          },
          {
            id: "creator_peers",
            label: "Other creators or beginners",
            sub: "People learning to grow in my space",
          },
        ],
        allowCustom: true,
      };

  const steps: ClarificationStep[] = [audienceStep];

  if (hospitality) {
    steps.push({
      id: "venue_type",
      question: "What type of place is this Reel about?",
      options: [
        { id: "hotel", label: "Hotel, resort, or boutique stay" },
        { id: "restaurant", label: "Restaurant, cafe, or bar" },
        { id: "venue", label: "Event or wedding venue" },
        { id: "generic", label: "General hospitality / mixed" },
      ],
      allowCustom: true,
    });
    steps.push({
      id: "journey_moment",
      question: "What's the core angle or hook?",
      options: [
        {
          id: "full_journey",
          label: "The full guest journey from arrival to goodbye",
          sub: "Start-to-finish story arc",
        },
        {
          id: "during_stay",
          label: "One key moment that makes or breaks the experience",
          sub: "Single high-stakes beat in the visit",
        },
        {
          id: "check_in",
          label: "Behind the scenes of how you deliver the experience",
          sub: "What guests never see but feel",
        },
        {
          id: "checkout",
          label: "Guest transformation or before/after story",
          sub: "Emotional payoff and repeat-visit trigger",
        },
      ],
      allowCustom: true,
    });
  } else {
    steps.push({
      id: "journey_moment",
      question: "What's the core angle or hook?",
      options: [
        {
          id: "full_journey",
          label: "Full story from problem to payoff",
          sub: "Complete narrative arc",
        },
        {
          id: "during_stay",
          label: "One surprising insight or mistake",
          sub: "Curiosity-gap hook",
        },
        {
          id: "check_in",
          label: "Behind the scenes / how it's really done",
          sub: "Insider perspective",
        },
        {
          id: "checkout",
          label: "Before and after transformation",
          sub: "Visual or emotional contrast",
        },
      ],
      allowCustom: true,
    });
  }

  return { version: 1, steps };
}

const AUDIENCE_LABELS: Record<string, string> = {
  guests: "End guests, diners, or travelers",
  customers: "My customers or audience",
  operators: "Other business owners or operators in my industry",
  creator_peers: "Other creators or beginners in my niche",
};

export function audienceTypeFromAnswer(audienceId: string): ClarificationAudienceType {
  if (audienceId === "guests" || audienceId === "customers") return "b2c";
  if (audienceId === "operators") return "b2b";
  if (audienceId === "creator_peers") return "creator_peers";
  return "other";
}

export function formatClarificationAnswers(
  originalIdea: string,
  wizard: IdeaClarificationWizard,
  answers: Record<string, string>,
  customNotes?: string
): {
  enrichedIdea: string;
  targetAudience: string;
  audienceType: ClarificationAudienceType;
  answerSummary: Array<{ question: string; answer: string }>;
} {
  const summary: Array<{ question: string; answer: string }> = [];

  const stepsToUse = resolveWizardSteps(wizard, answers);

  for (const step of stepsToUse) {
    const raw = answers[step.id]?.trim();
    if (!raw) continue;
    const opt = step.options.find((o) => o.id === raw);
    const label = opt?.label ?? raw;
    summary.push({ question: step.question, answer: label });
  }

  if (customNotes?.trim()) {
    summary.push({ question: "Additional detail", answer: customNotes.trim() });
  }

  const audienceId = answers.audience ?? "";
  const targetAudience =
    AUDIENCE_LABELS[audienceId] ??
    answers.audience ??
    customNotes?.trim() ??
    "General audience";

  const lines = summary.map((s) => `- ${s.question}: ${s.answer}`);
  const enrichedIdea = `${originalIdea.trim()}\n\nCreator context:\n${lines.join("\n")}\n\nTarget audience: ${targetAudience}`;

  return {
    enrichedIdea,
    targetAudience,
    audienceType: audienceTypeFromAnswer(audienceId),
    answerSummary: summary,
  };
}

export function suggestionHedgesAudience(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.toLowerCase();
  return (
    /\b(either .+ or|guests or operators|operators or guests|peers or customers|both audiences|target either)\b/.test(
      t
    ) || /\boperators\b/.test(t) && /\b(guests|customers|diners|travelers)\b/.test(t)
  );
}

export function readTargetAudienceFromIdeaMeta(viralStructure: unknown): {
  label: string;
  type: ClarificationAudienceType;
} | null {
  if (!viralStructure || typeof viralStructure !== "object") return null;
  const meta = (viralStructure as Record<string, unknown>).ideaMeta;
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const label = typeof m.targetAudience === "string" ? m.targetAudience.trim() : "";
  const type = m.audienceType;
  if (!label) return null;
  const validTypes = ["b2c", "b2b", "creator_peers", "other"] as const;
  const audienceType =
    typeof type === "string" && (validTypes as readonly string[]).includes(type)
      ? (type as ClarificationAudienceType)
      : "other";
  return { label, type: audienceType };
}
