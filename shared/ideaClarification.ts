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
        question: aiQuestion?.trim() || "Who is the target audience for this Reel?",
        options: [
          {
            id: "guests",
            label: "End guests, diners, or travelers",
            sub: "People visiting or experiencing your place",
          },
          {
            id: "operators",
            label: "Hotel, restaurant, or venue operators",
            sub: "Other owners and managers in hospitality",
          },
          {
            id: "creator_peers",
            label: "Other creators in my niche",
            sub: "Peers learning content or growth tactics",
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
      question: "What type of place is this about?",
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
      question: "Which part of the guest journey?",
      options: [
        { id: "check_in", label: "Arrival and check-in" },
        { id: "during_stay", label: "During the stay or visit" },
        { id: "checkout", label: "Checkout and goodbye" },
        { id: "full_journey", label: "Full journey start to finish" },
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

  for (const step of wizard.steps) {
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
