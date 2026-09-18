export type ResolvedRemakeIntent =
  | { status: "resolved"; mode: "same_topic"; angle?: undefined }
  | { status: "resolved"; mode: "niche"; angle?: undefined }
  | { status: "resolved"; mode: "custom"; angle: string }
  | { status: "clarification_required" };

function compact(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\busing\s+spyreels(?:\s+private\s+test)?\b/gi, " ")
    .replace(/\bplease\b/gi, " ")
    .replace(/\bcan\s+you\b/gi, " ")
    .replace(/\bcould\s+you\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(value: string): string {
  return compact(value).toLowerCase();
}

function hasMeaningfulExplicitNiche(value: string): boolean {
  const patterns = [
    /\bfor\s+my\s+(.+?)\s+niche\b/i,
    /\bfor\s+(?:the\s+)?(.+?)\s+niche\b/i,
    /\bfor\s+my\s+(.+?)\s+audience\b/i,
    /\bfor\s+(?:the\s+)?(.+?)\s+audience\b/i,
  ];

  for (const pattern of patterns) {
    const match = compact(value).match(pattern);
    const candidate = match?.[1]?.trim().toLowerCase();
    if (!candidate) continue;
    if (candidate === "own" || candidate === "current" || candidate === "existing") {
      continue;
    }
    if (candidate === "my" || candidate === "our") continue;
    return true;
  }

  return false;
}

function isPlainRemakeRequest(value: string): boolean {
  const normalized = lower(value)
    .replace(/\bremake\b/g, " ")
    .replace(/\brewrite\b/g, " ")
    .replace(/\bthis\b/g, " ")
    .replace(/\bthat\b/g, " ")
    .replace(/\breel\b/g, " ")
    .replace(/\bvideo\b/g, " ")
    .replace(/\bit\b/g, " ")
    .replace(/\bfor\s+me\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length === 0;
}

export function resolveRemakeIntent(instruction: string): ResolvedRemakeIntent {
  const original = compact(instruction);
  const normalized = original.toLowerCase();

  if (!original) return { status: "clarification_required" };

  if (
    /\bkeep\s+(?:the\s+)?same\s+topic\b/i.test(original) ||
    /\bsame\s+topic\b/i.test(original) ||
    /\bkeep\s+(?:the\s+)?topic\b/i.test(original) ||
    /\bsame\s+subject\b/i.test(original) ||
    /\bdo\s+not\s+change\s+(?:the\s+)?topic\b/i.test(original) ||
    /\bdon['’]?t\s+change\s+(?:the\s+)?topic\b/i.test(original)
  ) {
    return { status: "resolved", mode: "same_topic" };
  }

  if (hasMeaningfulExplicitNiche(original)) {
    return { status: "resolved", mode: "custom", angle: original };
  }

  if (
    /\bmake\s+(?:this|it)\s+about\b/i.test(original) ||
    /\bremake\s+(?:this|it)\s+about\b/i.test(original) ||
    /\buse\s+(?:this|the)\s+structure\b/i.test(original) ||
    /\bchange\s+(?:the\s+)?topic\s+to\b/i.test(original) ||
    /\bmake\s+(?:this|it)\s+for\s+(?!me\b|my\s+niche\b|my\s+audience\b)/i.test(original)
  ) {
    return { status: "resolved", mode: "custom", angle: original };
  }

  if (
    /\bremake\s+(?:this|it)\s+similarly\s+for\s+me\b/i.test(original) ||
    /\bmake\s+(?:this|it)\s+my\s+version\b/i.test(original) ||
    /\bmy\s+version\b/i.test(original) ||
    /\badapt\s+(?:this|it)\s+to\s+my\s+niche\b/i.test(original) ||
    /\bfor\s+my\s+niche\b/i.test(original) ||
    /\bfor\s+my\s+audience\b/i.test(original) ||
    /\bbased\s+on\s+my\s+profile\b/i.test(original) ||
    /\bremake\s+(?:this|it)\s+for\s+me\b/i.test(original)
  ) {
    return { status: "resolved", mode: "niche" };
  }

  if (isPlainRemakeRequest(original)) {
    return { status: "clarification_required" };
  }

  if (
    /\babout\s+\S+/i.test(original) ||
    /\bangle\s*:\s*\S+/i.test(original) ||
    /\btopic\s*:\s*\S+/i.test(original)
  ) {
    return { status: "resolved", mode: "custom", angle: original };
  }

  return { status: "clarification_required" };
}
