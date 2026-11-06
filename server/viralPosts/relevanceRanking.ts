/**
 * Relevance-first ranking for Home's library videos (Phase 1, off by default).
 *
 * The current ranking (libraryHome.ts) takes videos tagged with the
 * profile's topics, then anything in the same category, then the most viral
 * videos overall, sorted by viral multiple. This module ranks by fit with the
 * creator first and uses proven performance only inside the relevant set.
 *
 * Pure: no database, provider or AI calls (the loader is relevanceHome.ts).
 *
 * Retrieval
 *   videos tagged with the profile's topics, plus the closest videos by
 *   meaning (cosine of the profile's SUBJECT embedding, made from category,
 *   niche, pillars and sub-topics, against each video's summary embedding).
 *
 * Order of checks: subject first (RELEVANCE.subjectGate on the meaning score;
 * audience words cannot rescue an off-subject video), then audience and
 * place, then performance. When fewer than the requested number are strongly
 * on the subject (RELEVANCE.subjectStrong), only those are picked and the
 * looser ones are returned apart as `adjacent`.
 *
 * Relevance R (0..1)
 *   semantic  0.55  meaning similarity, mapped from cosine to 0..1
 *   topic     0.25  1 when the video carries 2+ of the profile's topics, 0.7 for 1
 *   audience  0.10  the video names the creator's audience (moms, owners, expats...)
 *   place     0.10  the video is about the creator's place
 *   R must reach RELEVANCE.gate to be shown.
 *
 * Checks that reject or demote (each with a reason, never silent)
 *   language   the caption's language is neither a declared language nor the
 *              language the creator writes their strategy in: rejected
 *   place      the creator is place-specific (Dubai rentals) and the video is
 *              about another place: rejected; no place stated: x0.7
 *   re-upload  TV / film clips and episode re-uploads: rejected (not remakeable)
 *   advert     promotional videos are kept only when clearly relevant
 *              (R >= RELEVANCE.advertKeep), with a penalty; otherwise rejected
 *   no text    nothing to judge it by: rejected
 *
 * Final score = 0.70 R + 0.30 P, where P (0..1) is proven performance: viral
 * multiple (log), freshness and rising. One video per creator. When fewer
 * than the requested number pass, fewer are returned with coverage "thin":
 * unrelated videos are never used to fill the gap.
 */

export type RelevanceAudience = { who: string; outcome?: string; problem?: string };

export type RelevanceProfile = {
  id: string;
  niche: string;
  category?: string | null;
  pillars: string[];
  subtopics: string[];
  audiences: RelevanceAudience[];
  goals: string[];
  /** Language codes the creator publishes in (e.g. "en", "ar"). Empty = inferred from their own text. */
  languages: string[];
  topicSlugs: ReadonlySet<string>;
  embedding: ArrayLike<number> | null;
};

export type RelevanceVideo = {
  id: number;
  platform: string;
  url: string;
  caption: string;
  summary: string | null;
  format: string | null;
  topicSlugs: readonly string[];
  status: string;
  multiple: number | null;
  publishedAt: Date | null;
  creatorKey: string;
  embedding: ArrayLike<number> | null;
};

export type RejectReason =
  | "off_subject"
  | "below_relevance_gate"
  | "language_mismatch"
  | "different_place"
  | "reupload_clip"
  | "advert_not_relevant"
  | "no_text";

export type ScoredVideo = {
  video: RelevanceVideo;
  R: number;
  P: number;
  score: number;
  parts: { semantic: number; cosine: number | null; topic: number; audience: number; place: number };
  flags: string[];
  rejected: RejectReason | null;
};

export const RELEVANCE = {
  weights: { semantic: 0.55, topic: 0.25, audience: 0.1, place: 0.1 },
  /** Cosine at or below this counts as unrelated (0), at or above simHigh as a full match (1). */
  simLow: 0.25,
  simHigh: 0.55,
  gate: 0.55,
  /** Subject first: the video must be about the creator's subject (meaning score, 0..1) before audience or performance count. */
  subjectGate: 0.5,
  /** Strong evidence of the specific subject. When fewer than `limit` videos have it, only those are shown (thin coverage). */
  subjectStrong: 0.9,
  advertKeep: 0.7,
  advertPenalty: 0.15,
  placeUnknownFactor: 0.7,
  final: { relevance: 0.7, performance: 0.3 },
  retrieveBySimilarity: 400,
} as const;

/* ---------- text helpers ---------- */

const STOP = new Set(
  "a an the and or of for to in on at by with from about into over under your you our their them they who what how why when that this these those is are be been being it its as up out more most less few many much any all some each every other than then so very just also only own same such no nor not can will would should could may might must have has had do does did get gets got make makes made help helps helping want wants people person someone everyone users customers clients audience who's".split(
    " "
  )
);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Too broad to say a video is made for this audience ("business owners" are everyone in Business). */
const GENERIC_AUDIENCE = new Set(
  "business businesse owner small new aspiring local online creator content brand entrepreneur startup company team professional beginner people individual anyone looking build building grow growing start starting want".split(" ")
);

const AUDIENCE_ALIASES: Record<string, string[]> = {
  mom: ["mom", "moms", "mother", "mothers", "mum", "mums", "mama", "mommy", "momlife", "postpartum"],
  dad: ["dad", "dads", "father", "fathers", "dadlife"],
  parent: ["parent", "parents", "parenting"],
  woman: ["woman", "women", "female", "ladies", "girls"],
  man: ["man", "men", "male", "guys"],
  owner: ["owner", "owners"],
  expat: ["expat", "expats", "expatriate", "expatriates"],
  tenant: ["tenant", "tenants", "renter", "renters", "renting"],
  landlord: ["landlord", "landlords"],
  beginner: ["beginner", "beginners", "newbie", "newbies"],
  student: ["student", "students"],
  teacher: ["teacher", "teachers", "educator", "educators"],
};

/** Words that describe who the creator talks to (stemmed, with aliases). Pure; exported for tests. */
export function audienceTerms(audiences: readonly RelevanceAudience[]): string[] {
  const out = new Set<string>();
  for (const a of audiences) {
    for (const w of words(`${a.who}`)) {
      const s = stem(w);
      if (STOP.has(w) || GENERIC_AUDIENCE.has(s) || GENERIC_AUDIENCE.has(w) || s.length < 3 || /^\d+$/.test(s)) continue;
      const alias = Object.entries(AUDIENCE_ALIASES).find(([, list]) => list.includes(w));
      if (alias) alias[1].forEach(x => out.add(stem(x)));
      else out.add(s);
    }
  }
  return [...out];
}

/* ---------- places ---------- */

/** Canonical place -> words that point to it (lowercase). Small on purpose: common creator markets. */
const PLACES: Record<string, string[]> = {
  uae: ["dubai", "abu dhabi", "sharjah", "uae", "emirates", "rera", "ejari", "dld", "jbr", "jvc", "deira"],
  saudi: ["saudi", "riyadh", "jeddah", "ksa"],
  us: ["usa", "u s", "u s a", "united states", "america", "american", "fha", "va loan", "freddie mac", "fannie mae", "401k", "irs", "zillow", "texas", "florida", "california", "new york", "nyc", "atlanta", "chicago", "las vegas", "arizona", "georgia", "ohio", "idaho", "fort worth", "dallas", "houston", "miami"],
  uk: ["uk", "united kingdom", "britain", "british", "england", "london", "manchester", "hmrc", "stamp duty", "help to buy"],
  canada: ["canada", "canadian", "toronto", "vancouver", "ontario"],
  australia: ["australia", "australian", "sydney", "melbourne"],
  india: ["india", "indian", "mumbai", "delhi", "bangalore", "rupees", "lakh", "crore"],
  pakistan: ["pakistan", "karachi", "lahore", "islamabad"],
  brazil: ["brazil", "brasil", "sao paulo", "rio"],
  mexico: ["mexico", "cdmx"],
  philippines: ["philippines", "manila"],
  nigeria: ["nigeria", "lagos"],
  europe: ["germany", "berlin", "france", "paris", "spain", "madrid", "italy", "netherlands", "amsterdam"],
};

/** Places a text is about. Pure; exported for tests. */
export function placesIn(text: string): string[] {
  const t = ` ${words(text).join(" ")} `;
  const out: string[] = [];
  for (const [place, keys] of Object.entries(PLACES)) {
    if (keys.some(k => t.includes(` ${k} `))) out.push(place);
  }
  return out;
}

/* ---------- language ---------- */

const LANG_HINTS: Record<string, string[]> = {
  en: ["the", "and", "you", "your", "this", "how", "what", "with", "for", "are", "is", "my"],
  es: ["el", "la", "los", "las", "que", "para", "con", "una", "por", "como", "tu", "es"],
  pt: ["voce", "para", "com", "uma", "nao", "que", "como", "seu", "sua", "isso", "mais"],
  fr: ["le", "la", "les", "des", "pour", "avec", "une", "est", "vous", "dans", "pas"],
  de: ["der", "die", "das", "und", "ist", "nicht", "mit", "fur", "ein", "eine", "du"],
  it: ["il", "che", "per", "con", "una", "non", "sono", "della", "come", "piu"],
};

/** Best-effort language of a caption: script first, then common words. Null when unsure. Pure; exported for tests. */
export function detectLanguage(text: string): string | null {
  const letters = text.replace(/[#@][\p{L}\p{N}_]+/gu, " ").replace(/https?:\/\/\S+/g, " ");
  const count = (re: RegExp) => (letters.match(re) ?? []).length;
  const total = count(/\p{L}/gu);
  if (total < 12) return null;
  const scripts: Array<[string, RegExp]> = [
    ["ar", /\p{Script=Arabic}/gu],
    ["hi", /\p{Script=Devanagari}/gu],
    ["ru", /\p{Script=Cyrillic}/gu],
    ["ja", /[\p{Script=Hiragana}\p{Script=Katakana}]/gu],
    ["zh", /\p{Script=Han}/gu],
    ["ko", /\p{Script=Hangul}/gu],
    ["th", /\p{Script=Thai}/gu],
    ["he", /\p{Script=Hebrew}/gu],
    ["bn", /\p{Script=Bengali}/gu],
  ];
  for (const [code, re] of scripts) if (count(re) / total > 0.3) return code;
  const ws = words(letters);
  if (ws.length < 4) return null;
  let best: string | null = null;
  let bestHits = 0;
  for (const [code, hints] of Object.entries(LANG_HINTS)) {
    const hits = ws.filter(w => hints.includes(w)).length;
    if (hits > bestHits) {
      best = code;
      bestHits = hits;
    }
  }
  return bestHits >= 2 ? best : null;
}

/* ---------- suitability ---------- */

const REUPLOAD = /\b(full episodes?|s\d{1,2}e\d{1,2}|season \d+ episode|movie clips?|#movieclips|#southpark\w*|#simpsons|#familyguy|#tvshow|#tvclips?)\b|new season of south park/i;
const PROMO_MARKERS = [
  /\blink in (my )?bio\b/i,
  /\b(order|shop|buy|book|call) now\b/i,
  /\b(dm|message|whatsapp|contact) (us|me) (to|for) (order|buy|purchase|price|pricing|book)/i,
  /\bwhatsapp\b/i,
  /\b(factory|wholesale|manufacturer|supplier) (direct|price|supply)?/i,
  /\b\d{1,2}% off\b|\bdiscount code\b|\buse code\b|\bpromo code\b/i,
  /\bfree (shipping|delivery)\b/i,
  /(\+?\d[\d\s-]{8,}\d)/,
  /\bvisit our (store|shop|website|restaurant)\b/i,
];

export function promoMarkers(text: string): number {
  return PROMO_MARKERS.filter(re => re.test(text)).length;
}

/* ---------- scoring ---------- */

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function semanticFromCosine(c: number | null): number {
  if (c == null) return 0;
  return clamp01((c - RELEVANCE.simLow) / (RELEVANCE.simHigh - RELEVANCE.simLow));
}

export function performanceScore(v: Pick<RelevanceVideo, "multiple" | "publishedAt" | "status">, now: Date): number {
  const m = Math.max(1, v.multiple ?? 1);
  const viral = clamp01(Math.log10(m) / Math.log10(200));
  const ageDays = v.publishedAt ? Math.max(0, (now.getTime() - v.publishedAt.getTime()) / 86_400_000) : 180;
  const fresh = 1 / (1 + ageDays / 30);
  return clamp01(0.6 * viral + 0.3 * fresh + (v.status === "rising" ? 0.1 : 0));
}

/** Words for kinds of people. Stripped from the subject text unless the subject IS about them (parenting, family). */
const DEMOGRAPHIC_WORDS = new Set(
  "mom moms mother mothers mum mums mama mommy momlife dad dads father fathers parent parents kid kids child children toddler toddlers woman women female ladies girls man men male guys busy working".split(" ")
);
/** Subjects that are ABOUT those people (parenting, family life, motherhood): their people words stay. */
const PEOPLE_SUBJECT = /parent|famil|motherhood|fatherhood|pregnan|momlife|mom life|dad life/i;

function stripDemographics(text: string): string {
  return text
    .split(/(\s+)/)
    .filter(tok => !DEMOGRAPHIC_WORDS.has(tok.toLowerCase().replace(/[^\p{L}]/gu, "")))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Text the profile's relevance embedding is made from: the SUBJECT only
 * (category, niche, pillars, sub-topics). Audience and goals are left out on
 * purpose, so "moms" in the audience cannot make a mom lifestyle vlog look
 * like a match for a moms' fitness coach. Audience is checked separately,
 * after the subject passes. Pure; exported for tests.
 */
export function relevanceProfileText(p: Pick<RelevanceProfile, "niche" | "category" | "pillars" | "subtopics">): string {
  // "Fitness coaching for busy moms" -> "Fitness coaching for": who it is for is checked later, as audience.
  // Kept when the subject is about those people (a parenting creator).
  const aboutPeople = PEOPLE_SUBJECT.test(`${p.category ?? ""} ${p.niche}`) || !words(stripDemographics(p.niche)).some(w => !STOP.has(w));
  const t = (x: string) => (aboutPeople ? x : stripDemographics(x));
  return [
    p.category && `Category: ${p.category}`,
    p.niche && `Niche: ${t(p.niche)}`,
    p.pillars.length > 0 && `Content pillars: ${p.pillars.map(t).join("; ")}`,
    p.subtopics.length > 0 && `Sub-topics: ${p.subtopics.map(t).join("; ")}`,
  ]
    .filter(Boolean)
    .join(". ");
}

/** Full description (subject, audience, goals) for people and reviewers. Pure; exported for tests. */
export function profileDescription(p: Pick<RelevanceProfile, "niche" | "category" | "pillars" | "subtopics" | "audiences" | "goals">): string {
  return [
    p.category && `Category: ${p.category}`,
    p.niche && `Niche: ${p.niche}`,
    p.audiences.length > 0 &&
      `Audience: ${p.audiences.map(a => [a.who, a.outcome && `wants to ${a.outcome}`, a.problem && `struggles with ${a.problem}`].filter(Boolean).join(", ")).join("; ")}`,
    p.goals.length > 0 && `Goals: ${p.goals.join("; ")}`,
    p.pillars.length > 0 && `Content pillars: ${p.pillars.join("; ")}`,
    p.subtopics.length > 0 && `Sub-topics: ${p.subtopics.join("; ")}`,
  ]
    .filter(Boolean)
    .join(". ");
}

export type ProfileSignals = { audience: string[]; places: string[]; placeStrict: boolean; languages: string[] };

/** What the checks need from a profile, worked out once. Pure; exported for tests. */
export function profileSignals(p: RelevanceProfile): ProfileSignals {
  const core = [p.niche, ...p.pillars].join(" . ");
  const all = [core, ...p.subtopics, ...p.audiences.map(a => `${a.who} ${a.outcome ?? ""}`), ...p.goals].join(" . ");
  const strictPlaces = placesIn(core);
  const places = [...new Set([...strictPlaces, ...placesIn(all)])];
  // Declared languages plus the language the creator writes their own strategy in.
  const declared = p.languages.map(l => l.toLowerCase().slice(0, 2));
  const languages = [...new Set([...declared, detectLanguage(all) ?? "en"])];
  return { audience: audienceTerms(p.audiences), places, placeStrict: strictPlaces.length > 0, languages };
}

export function scoreVideo(p: RelevanceProfile, sig: ProfileSignals, v: RelevanceVideo, now: Date, final: { relevance: number; performance: number } = RELEVANCE.final): ScoredVideo {
  const text = `${v.caption ?? ""} ${v.summary ?? ""}`.trim();
  const flags: string[] = [];
  const cos = p.embedding && v.embedding ? cosine(p.embedding, v.embedding) : null;
  const semantic = semanticFromCosine(cos);
  const overlap = v.topicSlugs.filter(t => p.topicSlugs.has(t)).length;
  const topic = overlap >= 2 ? 1 : overlap === 1 ? 0.7 : 0;
  const videoWords = new Set(words(text).map(stem));
  const audience = sig.audience.some(t => videoWords.has(t)) ? 1 : 0;
  const vPlaces = placesIn(text);
  const samePlace = sig.places.length > 0 && vPlaces.some(x => sig.places.includes(x));
  const place = samePlace ? 1 : 0;
  const parts = { semantic, cosine: cos, topic, audience, place };
  const w = RELEVANCE.weights;
  let R = w.semantic * semantic + w.topic * topic + w.audience * audience + w.place * place;
  let rejected: RejectReason | null = null;

  if (!text) rejected = "no_text";
  const lang = detectLanguage(v.caption ?? "");
  if (!rejected && lang && !sig.languages.includes(lang)) rejected = "language_mismatch";
  if (!rejected && sig.placeStrict) {
    if (vPlaces.length > 0 && !samePlace) rejected = "different_place";
    else if (!samePlace) {
      R *= RELEVANCE.placeUnknownFactor;
      flags.push("place_not_stated");
    }
  }
  if (!rejected && REUPLOAD.test(text)) rejected = "reupload_clip";
  const promo = promoMarkers(text);
  const advert = promo >= 2 || (promo >= 1 && v.format === "product_demo");
  if (!rejected && advert) {
    if (R < RELEVANCE.advertKeep) rejected = "advert_not_relevant";
    else {
      R -= RELEVANCE.advertPenalty;
      flags.push("advert_kept_relevant");
    }
  }
  // Subject first. Without an embedding, a topic tag is the only subject evidence.
  const subjectOk = cos != null ? semantic >= RELEVANCE.subjectGate : topic > 0;
  if (!rejected && !subjectOk) rejected = "off_subject";
  if (!rejected && R < RELEVANCE.gate) rejected = "below_relevance_gate";
  if (audience) flags.push("names_audience");
  if (samePlace) flags.push("same_place");
  const P = performanceScore(v, now);
  const score = rejected ? 0 : final.relevance * R + final.performance * P;
  return { video: v, R: clamp01(R), P, score, parts, flags, rejected };
}

export type RankResult = {
  picked: ScoredVideo[];
  /** Passed the checks but only loosely on the subject; shown separately and labelled, never mixed into picked. */
  adjacent: ScoredVideo[];
  rejected: ScoredVideo[];
  eligible: number;
  coverage: "ok" | "thin" | "none";
};

/**
 * Retrieve, score, gate and pick. `limit` videos at most, one per creator;
 * fewer when coverage is thin. Pure; exported for tests.
 */
export function rankForProfile(p: RelevanceProfile, library: readonly RelevanceVideo[], opts: { limit: number; now?: Date; exclude?: ReadonlySet<number>; final?: { relevance: number; performance: number } }): RankResult {
  const now = opts.now ?? new Date();
  const sig = profileSignals(p);
  const pool = library.filter(v => !opts.exclude?.has(v.id));
  // Retrieval: topic-tagged videos, plus the closest by meaning.
  const byTopic = pool.filter(v => v.topicSlugs.some(t => p.topicSlugs.has(t)));
  let bySimilarity: RelevanceVideo[] = [];
  if (p.embedding) {
    bySimilarity = pool
      .filter(v => v.embedding)
      .map(v => ({ v, c: cosine(p.embedding!, v.embedding!) }))
      .sort((a, b) => b.c - a.c)
      .slice(0, RELEVANCE.retrieveBySimilarity)
      .map(x => x.v);
  }
  const candidates = [...new Map([...byTopic, ...bySimilarity].map(v => [v.id, v])).values()];
  const scored = candidates.map(v => scoreVideo(p, sig, v, now, opts.final));
  const ok = scored.filter(s => !s.rejected).sort((a, b) => b.score - a.score);
  const onePerCreator = (list: ScoredVideo[], max: number, seen = new Set<string>()) => {
    const out: ScoredVideo[] = [];
    for (const s of list) {
      if (out.length >= max) break;
      if (s.video.creatorKey && seen.has(s.video.creatorKey)) continue;
      seen.add(s.video.creatorKey);
      out.push(s);
    }
    return out;
  };
  // Thin niche: when too few videos are strongly about the subject, show only those.
  // The looser ones go to `adjacent` (shown apart, labelled), never mixed in.
  const strong = onePerCreator(ok.filter(s => s.parts.cosine == null || s.parts.semantic >= RELEVANCE.subjectStrong), opts.limit);
  const seen = new Set<string>();
  const picked = strong.length >= opts.limit ? onePerCreator(ok, opts.limit, seen) : onePerCreator(strong, opts.limit, seen);
  const pickedIds = new Set(picked.map(s => s.video.id));
  const adjacent = picked.length < opts.limit ? onePerCreator(ok.filter(s => !pickedIds.has(s.video.id)), opts.limit - picked.length, seen) : [];
  const rejected = scored.filter(s => s.rejected).sort((a, b) => b.R - a.R);
  const coverage = picked.length === 0 ? "none" : picked.length < opts.limit ? "thin" : "ok";
  return { picked, adjacent, rejected, eligible: ok.length, coverage };
}
