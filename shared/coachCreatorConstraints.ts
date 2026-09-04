export type DelayedTermConstraint = {
  term: string;
  required: true;
  allowedLocation: "finalSpokenLine";
};

export type CoachCreatorConstraints = {
  requiredTerms: string[];
  forbiddenTerms: string[];
  delayedTerms: DelayedTermConstraint[];
  requiredEnding: string | null;
  forbiddenTopics: string[];
  stanceRequirements: string[];
};

export type CoachSpokenScript = {
  hook: string;
  explain: string;
  illustrate: string;
  teach: string;
  cta?: string;
};

export type CoachConstraintViolation = {
  code: string;
  message: string;
};

const DELAYED_TERM_RE =
  /do(?:\s+no|\s*n['’]?)t\s+(?:say|name|mention|use)\s+["“]?([A-Za-z][\w.-]{1,40})["”]?\s+until\s+the\s+final\s+(?:line|sentence)/gi;
const FORBIDDEN_PHRASE_RE =
  /do(?:\s+no|\s*n['’]?)t\s+(?:say|name|mention)\s+["“']([^"”']{2,80})["”']/gi;

export function emptyCoachCreatorConstraints(): CoachCreatorConstraints {
  return {
    requiredTerms: [],
    forbiddenTerms: [],
    delayedTerms: [],
    requiredEnding: null,
    forbiddenTopics: [],
    stanceRequirements: [],
  };
}

function uniquePush(list: string[], value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (list.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return;
  list.push(trimmed);
}

export function extractCoachCreatorConstraints(rawIdea: string): CoachCreatorConstraints {
  const text = rawIdea.trim();
  const constraints = emptyCoachCreatorConstraints();
  if (!text) return constraints;

  for (const match of text.matchAll(DELAYED_TERM_RE)) {
    const term = (match[1] ?? "").trim();
    if (!term) continue;
    if (!constraints.delayedTerms.some((item) => item.term.toLowerCase() === term.toLowerCase())) {
      constraints.delayedTerms.push({
        term,
        required: true,
        allowedLocation: "finalSpokenLine",
      });
    }
    uniquePush(constraints.requiredTerms, term);
  }

  for (const match of text.matchAll(FORBIDDEN_PHRASE_RE)) {
    const phrase = (match[1] ?? "").trim();
    if (!phrase) continue;
    const isDelayed = constraints.delayedTerms.some(
      (item) => item.term.toLowerCase() === phrase.toLowerCase()
    );
    if (isDelayed) continue;
    uniquePush(constraints.forbiddenTerms, phrase);
  }

  const forbidsPriceLane =
    /do not turn this into a .{0,120}(financ|price|pricing)/i.test(text) ||
    /do not talk about (?:price|pricing|financ)/i.test(text) ||
    /do not (?:make (?:this|it) about|mention) (?:price|pricing|financ)/i.test(text);
  if (forbidsPriceLane) {
    if (/financ/i.test(text)) uniquePush(constraints.forbiddenTopics, "financing");
    if (/price|pricing/i.test(text)) uniquePush(constraints.forbiddenTopics, "equipment pricing");
  }

  if (/do not soften/i.test(text)) {
    uniquePush(
      constraints.stanceRequirements,
      "preserve the stated opinion without hedging or balancing it"
    );
  }

  const endMatch = text.match(/\bend (?:with|by) ([^.]+)/i);
  if (endMatch?.[1]) {
    constraints.requiredEnding = endMatch[1].trim();
  }

  return constraints;
}

export function spokenSections(script: CoachSpokenScript): string[] {
  return [script.hook, script.explain, script.illustrate, script.teach, script.cta ?? ""]
    .map((part) => part.trim())
    .filter(Boolean);
}

export function finalSpokenLine(script: CoachSpokenScript): string {
  const sections = spokenSections(script);
  return sections[sections.length - 1] ?? "";
}

export function earlierSpokenText(script: CoachSpokenScript): string {
  const sections = spokenSections(script);
  return sections.slice(0, -1).join("\n");
}

export function spokenScriptFromGenerated(generated: Record<string, unknown>): CoachSpokenScript {
  return {
    hook: typeof generated.hook === "string" ? generated.hook : "",
    explain: typeof generated.explain === "string" ? generated.explain : "",
    illustrate: typeof generated.illustrate === "string" ? generated.illustrate : "",
    teach: typeof generated.teach === "string" ? generated.teach : "",
    cta: typeof generated.cta === "string" ? generated.cta : "",
  };
}

function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function hasForbiddenPricingContent(spoken: string): boolean {
  if (/\bfinanc/i.test(spoken)) return true;
  if (/\bmonthly payment/i.test(spoken)) return true;
  if (/\bpayment plans?\b/i.test(spoken)) return true;
  if (/\bequipment[- ]?(?:price|pricing|cost)s?\b/i.test(spoken)) return true;
  if (/\$\s*[\d,]+/.test(spoken)) return true;
  if (/\b\d[\d,]*\s*(?:k|grand)\b/i.test(spoken)) return true;
  if (/\b(?:thousand|million)\s+dollars\b/i.test(spoken)) return true;
  if (
    /\b(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\s+(?:grand|thousand dollars)\b/i.test(
      spoken
    )
  ) {
    return true;
  }
  return false;
}

export function validateCoachScriptConstraints(
  script: CoachSpokenScript,
  constraints: CoachCreatorConstraints
): { ok: boolean; violations: CoachConstraintViolation[] } {
  const violations: CoachConstraintViolation[] = [];
  const spoken = spokenSections(script).join("\n");
  const finalLine = finalSpokenLine(script);
  const earlier = earlierSpokenText(script);

  for (const delayed of constraints.delayedTerms) {
    const inFinal = containsTerm(finalLine, delayed.term);
    const inEarlier = containsTerm(earlier, delayed.term);
    const anywhere = containsTerm(spoken, delayed.term);
    if (!anywhere || !inFinal) {
      violations.push({
        code: "delayed_term_missing_final",
        message: `${delayed.term} must appear in the final spoken line and nowhere earlier.`,
      });
    } else if (inEarlier) {
      violations.push({
        code: "delayed_term_too_early",
        message: `${delayed.term} must appear in the final spoken line and nowhere earlier.`,
      });
    }
  }

  for (const term of constraints.requiredTerms) {
    if (constraints.delayedTerms.some((item) => item.term.toLowerCase() === term.toLowerCase())) {
      continue;
    }
    if (!containsTerm(spoken, term)) {
      violations.push({
        code: "required_term_missing",
        message: `The script must include "${term}".`,
      });
    }
  }

  for (const term of constraints.forbiddenTerms) {
    if (containsTerm(spoken, term)) {
      violations.push({
        code: "forbidden_term",
        message: `The script must not say "${term}".`,
      });
    }
  }

  const caresAboutPrice = constraints.forbiddenTopics.some((topic) =>
    /financ|price|pricing/i.test(topic)
  );
  if (caresAboutPrice && hasForbiddenPricingContent(spoken)) {
    violations.push({
      code: "forbidden_topic",
      message: "The script must not turn this into a financing or equipment-price video.",
    });
  }

  return { ok: violations.length === 0, violations };
}

export function formatCoachCreatorConstraintsForPrompt(constraints: CoachCreatorConstraints): string {
  const lines: string[] = [];
  for (const delayed of constraints.delayedTerms) {
    lines.push(
      `- ${delayed.term} must appear in the final spoken line and nowhere earlier.`
    );
  }
  for (const term of constraints.requiredTerms) {
    if (constraints.delayedTerms.some((item) => item.term.toLowerCase() === term.toLowerCase())) {
      continue;
    }
    lines.push(`- The spoken script must include "${term}".`);
  }
  for (const term of constraints.forbiddenTerms) {
    lines.push(`- Do not say "${term}".`);
  }
  for (const topic of constraints.forbiddenTopics) {
    lines.push(`- Do not turn this into a ${topic} video. Do not invent dollar amounts as equipment cost.`);
  }
  for (const stance of constraints.stanceRequirements) {
    lines.push(`- Stance: ${stance}.`);
  }
  if (constraints.requiredEnding) {
    lines.push(`- End by: ${constraints.requiredEnding}.`);
  }
  if (lines.length === 0) return "";
  return `CREATOR CONSTRAINTS (hard rules; these beat strategy, niche, and research):\n${lines.join("\n")}`;
}

export function formatCoachConstraintCorrectionInstruction(
  violations: Array<{ message: string }>
): string {
  const unique = Array.from(new Set(violations.map((item) => item.message)));
  return `The script violates one creator constraint:
${unique.join("\n")}

Keep the hook, narrative, tone, and all compliant content.
Fix only what is necessary.`;
}
