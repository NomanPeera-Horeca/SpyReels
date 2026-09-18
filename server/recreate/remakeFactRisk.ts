export type RemakeFactRisk = {
  kind: "unsupported_entity" | "unsupported_number" | "unsupported_quote" | "unsupported_source";
  value: string;
  sentence: string;
  reason: string;
};

export type RemakeFactRiskResult = {
  safe: boolean;
  risks: RemakeFactRisk[];
};

const COMMON_CAPITALIZED = new Set([
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "it",
  "this",
  "that",
  "these",
  "those",
  "the",
  "a",
  "an",
  "and",
  "but",
  "or",
  "so",
  "because",
  "if",
  "when",
  "most",
  "every",
  "nobody",
  "everyone",
  "here",
  "there",
  "first",
  "second",
  "third",
  "cta",
  "instagram",
  "reel",
  "reels",
  "tiktok",
  "youtube",
  "p&l",
]);

const GENERIC_SMALL_NUMBER_CONTEXT =
  /\b(?:steps?|tips?|ways?|rules?|reasons?|questions?|mistakes?|ideas?|points?|things?|signs?|habits?)\b/i;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9%$€£.'"-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentencesOf(script: string): string[] {
  return (
    script
      .replace(/\[[^\]]{1,80}\]/g, " ")
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []
  )
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function trustedIncludes(trusted: string, value: string): boolean {
  const needle = normalize(value);
  if (!needle) return true;
  return trusted.includes(needle);
}

function isFrameworkNumber(sentence: string, raw: string): boolean {
  const numeric = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 10) return false;
  return GENERIC_SMALL_NUMBER_CONTEXT.test(sentence);
}

function titleCaseEntities(sentence: string): string[] {
  const entities = new Set<string>();

  const named = sentence.match(
    /\b(?:named|called|name\s+is|founder\s+is|founded\s+by|started\s+by|owned\s+by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g
  );
  for (const match of named ?? []) {
    const value = match
      .replace(
        /^.*?\b(?:named|called|name\s+is|founder\s+is|founded\s+by|started\s+by|owned\s+by)\s+/i,
        ""
      )
      .trim();
    if (value) entities.add(value);
  }

  const multi = sentence.match(
    /\b[A-Z][A-Za-z0-9&'’-]*(?:\s+[A-Z][A-Za-z0-9&'’-]*){1,3}\b/g
  );
  for (const value of multi ?? []) {
    const normalized = normalize(value);
    if (
      normalized
        .split(" ")
        .every((part) => COMMON_CAPITALIZED.has(part))
    ) {
      continue;
    }
    entities.add(value.trim());
  }

  return [...entities];
}

function suspiciousSources(sentence: string): string[] {
  const patterns = [
    /\baccording to\s+[^,.!?]{2,80}/gi,
    /\b(?:a|the)\s+(?:new\s+)?study\s+(?:from|by)\s+[^,.!?]{2,80}/gi,
    /\b(?:research|report|survey)\s+(?:from|by)\s+[^,.!?]{2,80}/gi,
  ];
  return patterns.flatMap((pattern) => sentence.match(pattern) ?? []);
}

function attributedQuotes(sentence: string): string[] {
  if (!/\b(?:said|says|asked|wrote|told|according to)\b/i.test(sentence)) {
    return [];
  }
  return sentence.match(/[“"][^”"]{3,180}[”"]/g) ?? [];
}

export function validateRemakeFactRisk(input: {
  script: string;
  trustedTexts: string[];
}): RemakeFactRiskResult {
  const trusted = normalize(input.trustedTexts.filter(Boolean).join("\n"));
  const risks: RemakeFactRisk[] = [];
  const seen = new Set<string>();

  const addRisk = (risk: RemakeFactRisk) => {
    const key = `${risk.kind}|${normalize(risk.value)}|${normalize(risk.sentence)}`;
    if (seen.has(key)) return;
    seen.add(key);
    risks.push(risk);
  };

  for (const sentence of sentencesOf(input.script)) {
    for (const entity of titleCaseEntities(sentence)) {
      if (trustedIncludes(trusted, entity)) continue;
      addRisk({
        kind: "unsupported_entity",
        value: entity,
        sentence,
        reason:
          "Named people, companies, restaurants, institutions, or other real entities must come from the user's instruction or supplied research.",
      });
    }

    const highRiskNumbers =
      sentence.match(
        /(?:[$€£]\s?\d[\d,.]*|\b(?:19|20)\d{2}\b|\b\d+(?:\.\d+)?%\b|\b\d+(?:\.\d+)?\s*(?:million|billion|thousand|years?|months?|weeks?|days?|hours?|minutes?|customers?|locations?|stores?|revenue|sales|profit|margin)\b)/gi
      ) ?? [];

    for (const value of highRiskNumbers) {
      if (trustedIncludes(trusted, value) || isFrameworkNumber(sentence, value)) {
        continue;
      }
      addRisk({
        kind: "unsupported_number",
        value,
        sentence,
        reason:
          "Specific dates, money, percentages, scale, or performance numbers must be supported by the user's input or research.",
      });
    }

    for (const quote of attributedQuotes(sentence)) {
      if (trustedIncludes(trusted, quote.replace(/[“”"]/g, ""))) continue;
      addRisk({
        kind: "unsupported_quote",
        value: quote,
        sentence,
        reason:
          "Attributed quotes must be present in the user's input or research rather than invented.",
      });
    }

    for (const source of suspiciousSources(sentence)) {
      if (trustedIncludes(trusted, source)) continue;
      addRisk({
        kind: "unsupported_source",
        value: source,
        sentence,
        reason:
          "Named studies, reports, surveys, and attributed sources must be grounded in the supplied research.",
      });
    }
  }

  return {
    safe: risks.length === 0,
    risks: risks.slice(0, 12),
  };
}

export function formatFactRisksForRepair(risks: RemakeFactRisk[]): string {
  if (risks.length === 0) return "(none)";
  return risks
    .map(
      (risk, index) =>
        `${index + 1}. ${risk.kind}: "${risk.value}"\n   Sentence: ${risk.sentence}\n   Why risky: ${risk.reason}`
    )
    .join("\n");
}
