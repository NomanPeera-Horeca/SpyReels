export type CoachScriptSections = {
  explain: string;
  illustrate: string;
  teach: string;
  cta: string;
};

export type InstagramAudioPick = {
  title: string;
  artist?: string;
  searchHint: string;
  matchReason: string;
  isTrending?: boolean;
};

export type CoachProductionNotes = {
  device?: string;
  cameraSettings?: string;
  setup?: string;
  music?: string;
  musicMix?: string;
  instagramAudio?: InstagramAudioPick[];
  voiceTone?: string;
  bRoll?: Array<{ shot?: string; example?: string; canUseStock?: boolean }>;
  textOverlay?: string;
  hookOnScreenText?: string;
  frame0OnScreenText?: string;
  dualEncoding?: string;
  pacingNotes?: string;
  loopClosingNote?: string;
  soundOffSafe?: boolean;
  scriptMode?: string;
  contentFormat?: string;
  funnelStage?: string;
  sections?: CoachScriptSections;
};

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function splitLegacyBody(body: string): Pick<CoachScriptSections, "explain" | "illustrate"> {
  const trimmed = body.trim();
  if (!trimmed) return { explain: "", illustrate: "" };
  const parts = trimmed.split(/\n\n+/).filter(Boolean);
  if (parts.length <= 1) return { explain: trimmed, illustrate: "" };
  return { explain: parts[0] ?? "", illustrate: parts.slice(1).join("\n\n") };
}

export function sectionsFromGenerated(generated: Record<string, unknown>): CoachScriptSections {
  const explain = pickString(generated, "explain", "Explain");
  const illustrate = pickString(generated, "illustrate", "Illustrate");
  const teach = pickString(generated, "teach", "Teach", "T");
  const ctaDirect = pickString(generated, "cta", "CTA");
  const callToAction = pickString(generated, "callToAction", "call_to_action");
  const cta =
    ctaDirect ||
    (callToAction && callToAction !== teach ? callToAction : "");

  if (explain || illustrate || teach || cta) {
    const bodyFallback = pickString(generated, "body");
    const legacy = bodyFallback ? splitLegacyBody(bodyFallback) : { explain: "", illustrate: "" };
    return {
      explain: explain || legacy.explain,
      illustrate: illustrate || legacy.illustrate,
      teach,
      cta,
    };
  }

  const body = pickString(generated, "body");
  const legacy = splitLegacyBody(body);
  const combinedCta = pickString(generated, "callToAction", "call_to_action");
  return {
    explain: legacy.explain,
    illustrate: legacy.illustrate,
    teach: combinedCta,
    cta: "",
  };
}

export function combineBodyFromSections(sections: CoachScriptSections): string {
  return [sections.explain, sections.illustrate].filter(Boolean).join("\n\n");
}

export function parseProductionNotes(raw: string | null | undefined): CoachProductionNotes | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as CoachProductionNotes;
  } catch {
    return null;
  }
}

export function parseCoachScriptSections(args: {
  body: string;
  callToAction: string;
  productionNotes: string | null;
}): CoachScriptSections {
  const notes = parseProductionNotes(args.productionNotes);
  if (notes?.sections) {
    const teach = notes.sections.teach?.trim() ?? "";
    const ctaStored = notes.sections.cta?.trim() ?? "";
    const callToAction = args.callToAction.trim();
    const cta =
      ctaStored ||
      (callToAction && callToAction !== teach ? callToAction : "");
    return {
      explain: notes.sections.explain ?? "",
      illustrate: notes.sections.illustrate ?? "",
      teach,
      cta,
    };
  }

  const legacy = splitLegacyBody(args.body);
  const callToAction = args.callToAction.trim();
  return {
    explain: legacy.explain,
    illustrate: legacy.illustrate,
    teach: callToAction,
    cta: "",
  };
}

export function buildProductionNotesJson(
  productionCoach: unknown,
  sections: CoachScriptSections,
  extras?: { contentFormat?: string; funnelStage?: string; scriptMode?: string }
): string {
  const base =
    productionCoach && typeof productionCoach === "object"
      ? (productionCoach as Record<string, unknown>)
      : {};
  return JSON.stringify({
    ...base,
    contentFormat: extras?.contentFormat,
    funnelStage: extras?.funnelStage,
    scriptMode: extras?.scriptMode,
    sections,
  });
}

export function coachScriptIsComplete(generated: Record<string, unknown>): boolean {
  const hook = pickString(generated, "hook", "H");
  const sections = sectionsFromGenerated(generated);
  const hasBody =
    Boolean(sections.explain.trim()) &&
    Boolean(sections.illustrate.trim());
  const hasTakeaway = Boolean(sections.teach.trim());
  const hasCta = Boolean(sections.cta.trim());
  const distinctClose =
    hasTakeaway &&
    hasCta &&
    sections.cta.trim() !== sections.teach.trim();
  return Boolean(hook && hasBody && distinctClose);
}

export function flattenCoachScriptForCopy(args: {
  title: string;
  hook: string;
  sections: CoachScriptSections;
  userFriendly?: boolean;
}): string {
  if (args.userFriendly) {
    return flattenViralScriptForCopy(args);
  }
  const lines = [
    args.title,
    "",
    "HOOK",
    args.hook,
    "",
    "EXPLAIN",
    args.sections.explain,
    "",
    "ILLUSTRATE",
    args.sections.illustrate,
    "",
    "TEACH",
    args.sections.teach,
    "",
    "CALL TO ACTION",
    args.sections.cta,
  ];
  return lines.filter((line, i, arr) => line !== "" || arr[i - 1] !== "").join("\n");
}

/** Copy format shown to creators (no internal HEIT jargon). */
export function flattenViralScriptForCopy(args: {
  title: string;
  hook: string;
  sections: CoachScriptSections;
}): string {
  const lines = [
    args.title,
    "",
    "HOOK",
    args.hook,
    "",
    "PROBLEM SETUP",
    args.sections.explain,
    "",
    "STORY OR EXAMPLE",
    args.sections.illustrate,
    "",
    "KEY TAKEAWAY",
    args.sections.teach,
    "",
    "CALL TO ACTION",
    args.sections.cta,
  ];
  return lines.filter((line, i, arr) => line !== "" || arr[i - 1] !== "").join("\n");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}
