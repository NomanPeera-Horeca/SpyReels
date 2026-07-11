import {
  combineBodyFromSections,
  type CoachScriptSections,
} from "@shared/coachScriptSections";

export const STUDIO_REMAKE_SCHEDULE_KEY = "studio_remake_schedule";

export type StudioRemakeSchedulePrefill = {
  postDate?: string;
  postTime?: string;
  notes?: string;
};

export function parseStudioRemakeSchedulePrefill(
  raw: string | null
): StudioRemakeSchedulePrefill | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as StudioRemakeSchedulePrefill;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeRemakeScriptText(text: string): string {
  return text.trim().replace(/\r\n/g, "\n");
}

function splitFirstSentence(text: string): { first: string; rest: string } {
  const trimmed = text.trim();
  if (!trimmed) return { first: "", rest: "" };
  const match = trimmed.match(/^(.+?[.!?])(?:\s+([\s\S]*))?$/);
  if (!match) return { first: trimmed, rest: "" };
  return { first: match[1].trim(), rest: (match[2] ?? "").trim() };
}

export function flattenRemakeCoachText(args: {
  hook: string;
  sections: CoachScriptSections;
}): string {
  const parts = [
    args.hook.trim(),
    args.sections.explain.trim(),
    args.sections.illustrate.trim(),
    args.sections.teach.trim(),
    args.sections.cta.trim(),
  ].filter(Boolean);
  return parts.join("\n\n");
}

/** Map a flat remake script into Studio sections without LLM rewriting. */
export function buildCoachSectionsFromRemakeScript(flatScript: string): {
  hook: string;
  sections: CoachScriptSections;
  body: string;
  callToAction: string;
  wordCount: number;
} {
  const normalized = normalizeRemakeScriptText(flatScript);
  if (!normalized) {
    return {
      hook: "",
      sections: { explain: "", illustrate: "", teach: "", cta: "" },
      body: "",
      callToAction: "",
      wordCount: 0,
    };
  }

  let paragraphs = normalized.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);

  if (paragraphs.length === 1 && normalized.includes("\n")) {
    const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1) {
      paragraphs = [lines[0], lines.slice(1).join("\n")];
    }
  }

  if (paragraphs.length === 0) {
    const sentenceSplit = splitFirstSentence(normalized);
    paragraphs = sentenceSplit.rest
      ? [sentenceSplit.first, sentenceSplit.rest]
      : [normalized];
  }

  if (paragraphs.length === 1) {
    const sentenceSplit = splitFirstSentence(paragraphs[0]);
    if (sentenceSplit.rest) {
      paragraphs = [sentenceSplit.first, sentenceSplit.rest];
    }
  }

  let hook = paragraphs[0] ?? "";
  let cta = "";
  let middle = paragraphs.slice(1);

  if (paragraphs.length >= 3) {
    cta = paragraphs[paragraphs.length - 1] ?? "";
    middle = paragraphs.slice(1, -1);
  }

  let explain = "";
  let illustrate = "";
  let teach = "";

  if (middle.length === 1) {
    explain = middle[0] ?? "";
  } else if (middle.length === 2) {
    explain = middle[0] ?? "";
    teach = middle[1] ?? "";
  } else if (middle.length > 2) {
    explain = middle[0] ?? "";
    teach = middle[middle.length - 1] ?? "";
    illustrate = middle.slice(1, -1).join("\n\n");
  }

  const sections: CoachScriptSections = { explain, illustrate, teach, cta };
  const body = combineBodyFromSections(sections);
  const callToAction = cta || teach;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  return { hook, sections, body, callToAction, wordCount };
}
