export type RemakeReadabilityIssue = {
  type:
    | "passive_voice"
    | "complex_sentence"
    | "adverb"
    | "hard_to_read"
    | "very_hard_to_read";
  text: string;
  suggestion: string;
};

export type RemakeReadabilityAnalysis = {
  gradeLevel: number;
  readingEase: number;
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  issues: RemakeReadabilityIssue[];
  passiveVoiceCount: number;
  adverbCount: number;
  hardSentenceCount: number;
  veryHardSentenceCount: number;
  overallAssessment: string;
};

const ADVERB_EXCEPTIONS = new Set([
  "family",
  "only",
  "early",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "really",
]);

function spokenText(script: string): string {
  return script
    .replace(/\[[^\]]{1,80}\]/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsOf(value: string): string[] {
  return value.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g) ?? [];
}

function sentenceList(value: string): string[] {
  const normalized = spokenText(value);
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function syllablesInWord(raw: string): number {
  const word = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 1;
  if (word.length <= 3) return 1;

  let adjusted = word;
  if (/e$/.test(adjusted) && !/(le|ye)$/.test(adjusted)) {
    adjusted = adjusted.slice(0, -1);
  }
  adjusted = adjusted.replace(/(?:es|ed)$/g, (suffix) =>
    adjusted.length > 4 ? "" : suffix
  );

  const groups = adjusted.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function analyzeRemakeReadability(
  script: string
): RemakeReadabilityAnalysis {
  const text = spokenText(script);
  const words = wordsOf(text);
  const sentences = sentenceList(text);
  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = words.length;
  const syllableCount = words.reduce(
    (sum, word) => sum + syllablesInWord(word),
    0
  );

  const avgWordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 1;
  const gradeLevel = Math.max(
    0,
    0.39 * avgWordsPerSentence + 11.8 * syllablesPerWord - 15.59
  );
  const readingEase = Math.max(
    0,
    Math.min(
      100,
      206.835 - 1.015 * avgWordsPerSentence - 84.6 * syllablesPerWord
    )
  );

  const issues: RemakeReadabilityIssue[] = [];
  let hardSentenceCount = 0;
  let veryHardSentenceCount = 0;
  let passiveVoiceCount = 0;
  let adverbCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = wordsOf(sentence);
    if (sentenceWords.length >= 30) {
      veryHardSentenceCount += 1;
      if (issues.length < 10) {
        issues.push({
          type: "very_hard_to_read",
          text: sentence.slice(0, 260),
          suggestion: "Split this into two shorter spoken sentences.",
        });
      }
    } else if (sentenceWords.length >= 22) {
      hardSentenceCount += 1;
      if (issues.length < 10) {
        issues.push({
          type: "hard_to_read",
          text: sentence.slice(0, 260),
          suggestion: "Shorten this sentence for easier on-camera delivery.",
        });
      }
    }

    const passiveMatches =
      sentence.match(
        /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?\w+(?:ed|en)\b/gi
      ) ?? [];
    passiveVoiceCount += passiveMatches.length;
    for (const match of passiveMatches.slice(0, Math.max(0, 10 - issues.length))) {
      issues.push({
        type: "passive_voice",
        text: match,
        suggestion: "Prefer a direct active-voice construction when it sounds natural.",
      });
    }
  }

  for (const word of words) {
    const lower = word.toLowerCase();
    if (
      lower.length > 5 &&
      lower.endsWith("ly") &&
      !ADVERB_EXCEPTIONS.has(lower)
    ) {
      adverbCount += 1;
      if (issues.length < 10) {
        issues.push({
          type: "adverb",
          text: word,
          suggestion: "Use a stronger verb or remove the adverb if it adds little.",
        });
      }
    }
  }

  const assessment =
    gradeLevel <= 6 && avgWordsPerSentence <= 18
      ? "Easy conversational delivery."
      : gradeLevel <= 8 && avgWordsPerSentence <= 22
        ? "Generally clear, with a few lines worth tightening."
        : "The script is denser than ideal for short-form spoken delivery.";

  return {
    gradeLevel: round(gradeLevel),
    readingEase: round(readingEase),
    wordCount,
    sentenceCount,
    avgWordsPerSentence: round(avgWordsPerSentence),
    issues,
    passiveVoiceCount,
    adverbCount,
    hardSentenceCount,
    veryHardSentenceCount,
    overallAssessment: assessment,
  };
}
