export type DelayedTermConstraint = {
  term: string;
  required: true;
  allowedLocation: "finalSpokenLine";
};

export type CoachCreatorConstraints = {
  requiredTerms: string[];
  forbiddenTerms: string[];
  delayedTerms: DelayedTermConstraint[];
  requiredOpening: string | null;
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
const REQUIRED_OPENING_RE = /(?:open|start|begin)\s+with\s+["“]([^"”]+)["”]/i;
const REQUIRED_ENDING_QUOTED_RE = /(?:end|finish)\s+with\s+["“]([^"”]+)["”]/i;
const REQUIRED_ENDING_FALLBACK_RE = /\bend (?:with|by) ([^.]+)/i;
const FORBIDDEN_TOPIC_RE =
  /do(?:\s+no|\s*n['’]?)t\s+(?:discuss|talk about|mention)\s+([^.\n]+)/gi;
const DELAYED_UNTIL_FINAL_RE = /until\s+the\s+final\s+(?:line|sentence)/i;

export function emptyCoachCreatorConstraints(): CoachCreatorConstraints {
  return {
    requiredTerms: [],
    forbiddenTerms: [],
    delayedTerms: [],
    requiredOpening: null,
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

export function normalizeConstraintText(value: string): string {
  return value
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSpokenSentences(value: string): string[] {
  const normalized = normalizeConstraintText(value);
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized];
  return parts.map((part) => normalizeConstraintText(part)).filter(Boolean);
}

export function firstSpokenSentence(value: string): string {
  return splitSpokenSentences(value)[0] ?? "";
}

export function lastSpokenSentenceFromScript(script: CoachSpokenScript): string {
  const sections = spokenSections(script);
  const lastSection = sections[sections.length - 1] ?? "";
  const sentences = splitSpokenSentences(lastSection);
  return sentences[sentences.length - 1] ?? "";
}

function extractForbiddenTopicsFromClause(clause: string): string[] {
  const cleaned = normalizeConstraintText(clause)
    .replace(DELAYED_UNTIL_FINAL_RE, "")
    .replace(/\b(?:this|that|it|any|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];

  return cleaned
    .split(/\s*,\s*|\s+or\s+|\s+and\s+/i)
    .map((item) => normalizeConstraintText(item))
    .filter((item) => item.length >= 2 && item.length <= 40 && !/\s{3,}/.test(item));
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

  const openingMatch = text.match(REQUIRED_OPENING_RE);
  if (openingMatch?.[1]) {
    constraints.requiredOpening = normalizeConstraintText(openingMatch[1]);
  }

  const quotedEnding = text.match(REQUIRED_ENDING_QUOTED_RE);
  if (quotedEnding?.[1]) {
    constraints.requiredEnding = normalizeConstraintText(quotedEnding[1]);
  } else {
    const endMatch = text.match(REQUIRED_ENDING_FALLBACK_RE);
    if (endMatch?.[1]) {
      constraints.requiredEnding = normalizeConstraintText(endMatch[1]);
    }
  }

  for (const match of text.matchAll(FORBIDDEN_TOPIC_RE)) {
    const full = match[0] ?? "";
    const clause = match[1] ?? "";
    if (DELAYED_UNTIL_FINAL_RE.test(full) || DELAYED_UNTIL_FINAL_RE.test(clause)) continue;
    for (const topic of extractForbiddenTopicsFromClause(clause)) {
      const isDelayed = constraints.delayedTerms.some(
        (item) => item.term.toLowerCase() === topic.toLowerCase()
      );
      if (isDelayed) continue;
      uniquePush(constraints.forbiddenTopics, topic);
    }
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

export function containsConstraintTerm(haystack: string, term: string): boolean {
  return containsTerm(haystack, term);
}

const SPOKEN_SECTION_KEYS = ["hook", "explain", "illustrate", "teach", "cta"] as const;

function cloneSpokenScript(script: CoachSpokenScript): CoachSpokenScript {
  return {
    hook: script.hook,
    explain: script.explain,
    illustrate: script.illustrate,
    teach: script.teach,
    cta: script.cta ?? "",
  };
}

function joinSpokenSentences(sentences: string[]): string {
  return sentences.map((part) => part.trim()).filter(Boolean).join(" ");
}

function stripTermFromSentence(sentence: string, term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizeConstraintText(
    sentence.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "").replace(/\s+([,.!?])/g, "$1")
  );
}

function lastNonEmptySectionKey(script: CoachSpokenScript): (typeof SPOKEN_SECTION_KEYS)[number] | null {
  let last: (typeof SPOKEN_SECTION_KEYS)[number] | null = null;
  for (const key of SPOKEN_SECTION_KEYS) {
    if (String(script[key] ?? "").trim()) last = key;
  }
  return last;
}

export function earlierSpokenBeforeFinalSentence(script: CoachSpokenScript): string {
  const sections = spokenSections(script);
  if (sections.length === 0) return "";
  const lastSection = sections[sections.length - 1] ?? "";
  const lastSentences = splitSpokenSentences(lastSection);
  const earlierInLast = lastSentences.slice(0, -1).join(" ");
  return [...sections.slice(0, -1), earlierInLast].filter(Boolean).join("\n");
}

export function findConflictingCreatorConstraints(
  constraints: CoachCreatorConstraints
): CoachConstraintViolation | null {
  const ending = constraints.requiredEnding;
  if (!ending) return null;
  for (const delayed of constraints.delayedTerms) {
    if (!containsTerm(ending, delayed.term)) {
      return {
        code: "conflicting_required_ending",
        message: `The required ending cannot be combined with a delayed "${delayed.term}" instruction because that ending does not include ${delayed.term}.`,
      };
    }
  }
  return null;
}

function restoreRequiredOpening(script: CoachSpokenScript, opening: string): void {
  const rest = splitSpokenSentences(script.hook).slice(1);
  script.hook = joinSpokenSentences([opening, ...rest]);
}

function restoreRequiredEnding(script: CoachSpokenScript, ending: string): void {
  const lastKey = lastNonEmptySectionKey(script);
  if (!lastKey) {
    script.cta = ending;
    return;
  }
  const sentences = splitSpokenSentences(String(script[lastKey] ?? ""));
  if (sentences.length === 0) {
    script[lastKey] = ending;
    return;
  }
  sentences[sentences.length - 1] = ending;
  script[lastKey] = joinSpokenSentences(sentences);
}

function removeEarlyDelayedTerm(script: CoachSpokenScript, term: string): void {
  const nonempty = SPOKEN_SECTION_KEYS.filter((key) => String(script[key] ?? "").trim());
  for (let index = 0; index < nonempty.length; index++) {
    const key = nonempty[index];
    const isLastSection = index === nonempty.length - 1;
    const sentences = splitSpokenSentences(String(script[key] ?? ""));
    if (sentences.length === 0) continue;
    const lastSentence = isLastSection ? sentences[sentences.length - 1] : null;
    const early = isLastSection ? sentences.slice(0, -1) : sentences;
    const keptEarly = early.filter((sentence) => !containsTerm(sentence, term));
    if (keptEarly.length === 0 && early.length > 0 && !lastSentence) {
      script[key] = stripTermFromSentence(early[0], term);
      continue;
    }
    if (keptEarly.length === 0 && early.length > 0 && lastSentence) {
      script[key] = lastSentence;
      continue;
    }
    script[key] = joinSpokenSentences([...keptEarly, lastSentence].filter((part): part is string => Boolean(part)));
  }
}

function ensureDelayedTermInFinalSentence(script: CoachSpokenScript, term: string): void {
  if (containsTerm(lastSpokenSentenceFromScript(script), term)) return;
  const closer = `That is ${term}.`;
  const lastKey = lastNonEmptySectionKey(script) ?? "cta";
  const current = String(script[lastKey] ?? "").trim();
  script[lastKey] = current ? `${current} ${closer}` : closer;
}

export function applyDeterministicConstraintRepair(
  script: CoachSpokenScript,
  constraints: CoachCreatorConstraints
): { ok: boolean; used: boolean; script: CoachSpokenScript; conflict: CoachConstraintViolation | null } {
  const conflict = findConflictingCreatorConstraints(constraints);
  if (conflict) {
    return { ok: false, used: false, script: cloneSpokenScript(script), conflict };
  }

  const next = cloneSpokenScript(script);
  if (constraints.requiredOpening) {
    restoreRequiredOpening(next, constraints.requiredOpening);
  }
  if (constraints.requiredEnding) {
    restoreRequiredEnding(next, constraints.requiredEnding);
  }
  for (const delayed of constraints.delayedTerms) {
    removeEarlyDelayedTerm(next, delayed.term);
    if (!constraints.requiredEnding) {
      ensureDelayedTermInFinalSentence(next, delayed.term);
    }
  }

  const validated = validateCoachScriptConstraints(next, constraints);
  const used = JSON.stringify(next) !== JSON.stringify(cloneSpokenScript(script));
  return {
    ok: validated.ok,
    used,
    script: next,
    conflict: null,
  };
}

export function applyDeterministicConstraintRepairToGenerated(
  generated: Record<string, unknown>,
  constraints: CoachCreatorConstraints
): {
  ok: boolean;
  used: boolean;
  generated: Record<string, unknown>;
  conflict: CoachConstraintViolation | null;
} {
  const repaired = applyDeterministicConstraintRepair(spokenScriptFromGenerated(generated), constraints);
  if (!repaired.ok) {
    return {
      ok: false,
      used: repaired.used,
      generated,
      conflict: repaired.conflict,
    };
  }
  return {
    ok: true,
    used: repaired.used,
    conflict: null,
    generated: {
      ...generated,
      hook: repaired.script.hook,
      explain: repaired.script.explain,
      illustrate: repaired.script.illustrate,
      teach: repaired.script.teach,
      cta: repaired.script.cta ?? "",
    },
  };
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

function isPriceLaneTopic(topic: string): boolean {
  return /financ|price|pricing/i.test(topic);
}

export function validateCoachScriptConstraints(
  script: CoachSpokenScript,
  constraints: CoachCreatorConstraints
): { ok: boolean; violations: CoachConstraintViolation[] } {
  const violations: CoachConstraintViolation[] = [];
  const spoken = spokenSections(script).join("\n");
  const finalLine = lastSpokenSentenceFromScript(script);
  const earlier = earlierSpokenBeforeFinalSentence(script);

  if (constraints.requiredOpening) {
    const expected = normalizeConstraintText(constraints.requiredOpening);
    const actual = firstSpokenSentence(script.hook);
    if (!expected || actual !== expected) {
      violations.push({
        code: "required_opening_mismatch",
        message: `The spoken hook must open with exactly: ${expected}`,
      });
    }
  }

  if (constraints.requiredEnding) {
    const expected = normalizeConstraintText(constraints.requiredEnding);
    const actual = lastSpokenSentenceFromScript(script);
    if (!expected || actual !== expected) {
      violations.push({
        code: "required_ending_mismatch",
        message: `The final spoken line must be exactly: ${expected}`,
      });
    }
  }

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

  const caresAboutPrice = constraints.forbiddenTopics.some((topic) => isPriceLaneTopic(topic));
  if (caresAboutPrice && hasForbiddenPricingContent(spoken)) {
    violations.push({
      code: "forbidden_topic",
      message: "The script must not turn this into a financing or equipment-price video.",
    });
  }

  for (const topic of constraints.forbiddenTopics) {
    if (isPriceLaneTopic(topic)) continue;
    if (containsTerm(spoken, topic)) {
      violations.push({
        code: "forbidden_topic",
        message: `The script must not discuss ${topic}.`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

export function formatCoachCreatorConstraintsForPrompt(constraints: CoachCreatorConstraints): string {
  const lines: string[] = [];
  if (constraints.requiredOpening) {
    lines.push(`- Open with exactly this spoken line: "${constraints.requiredOpening}"`);
  }
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
    if (isPriceLaneTopic(topic)) {
      lines.push(`- Do not turn this into a ${topic} video. Do not invent dollar amounts as equipment cost.`);
    } else {
      lines.push(`- Do not discuss ${topic}.`);
    }
  }
  for (const stance of constraints.stanceRequirements) {
    lines.push(`- Stance: ${stance}.`);
  }
  if (constraints.requiredEnding) {
    lines.push(`- End with exactly this spoken line: "${constraints.requiredEnding}"`);
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
