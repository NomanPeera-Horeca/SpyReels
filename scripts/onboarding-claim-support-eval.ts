/**
 * Live-AI evaluation of ONBOARDING_CLAIM_SUPPORT (synthetic profiles only, no
 * DB, no production). Separate from the deterministic unit tests.
 *
 * Part A: labelled claims (the 18 from the first run + fresh held-out
 *   profiles). Each label is a PROPOSED human label for review. Reports the
 *   support review's agreement, its false rejections and false accepts, and
 *   the current exact-word check's false rejections on the same claims. A
 *   subset is repeated 3 times for consistency.
 * Part B: the real Goal and Audience code with the flag off vs on, on every
 *   profile: outcome, text, attempts, latency and cost. A subset is repeated.
 *
 *   pnpm exec tsx scripts/onboarding-claim-support-eval.ts --confirm-spend --cap=1.20
 */
import type { AnalysisSourceSnapshot } from "../shared/personalization/model";
import { buildCreatorEvidence, verbatimCta, type CreatorEvidence } from "../server/personalization/intelligence/evidence";
import { inferGoal } from "../server/personalization/intelligence/goalInference";
import { recommendAudiences } from "../server/personalization/intelligence/audienceRecommendations";
import { reviewClaims, supportEvidenceText } from "../server/personalization/intelligence/claimSupport";
import { EMPTY_POST_CONTEXT } from "../server/personalization/intelligence/postVisuals";
import { unsupportedNumbers, unsupportedProperNouns } from "../server/personalization/intelligence/guards";
import type { LlmInvoker } from "../server/personalization/intelligence/structuredLlm";

type Case = {
  id: string;
  kind: string;
  heldOut: boolean;
  displayName: string | null;
  bio: string | null;
  captions: string[];
  niche?: string;
};

const CASES: Case[] = [
  {
    id: "LOCAL-HOU", kind: "local events", heldOut: false,
    displayName: "Houston Happenings", bio: "Things to do in Houston 📍 HTX events, food & culture",
    captions: [
      "Dia de los Muertos at Discovery Green was a beautiful celebration of Mexican culture, music, art and tradition 🧡",
      "STEP BACK IN TIME AT THE TEXAS RENAISSANCE FESTIVAL",
      "Houston, tomorrow is your last chance to experience this year's Wings Over Houston",
      "5 free things to do this weekend in Houston",
      "Best birria tacos on Navigation Blvd 🌮",
    ],
  },
  {
    id: "LOCAL-DFW-AGENT", kind: "local business", heldOut: false,
    displayName: "Maya Brooks | DFW Realtor", bio: "Helping first-time buyers in Dallas–Fort Worth 🏡 DM 'HOME' for a free consult",
    captions: ["What $350k buys you in Frisco vs Plano", "3 mistakes first-time buyers make in DFW", "Closing day with the Nguyens!"],
  },
  {
    id: "FILM", kind: "people / film names", heldOut: false,
    displayName: "Reel Talk with Sam", bio: "Movie breakdowns 🎬 Villeneuve, Nolan, A24",
    captions: [
      "Why the sandworm ride in Dune: Part Two works",
      "Oppenheimer's sound design is doing something sneaky",
      "Past Lives ending explained",
      "Ranking every Christopher Nolan movie",
    ],
  },
  {
    id: "COMEDY", kind: "people names", heldOut: false,
    displayName: "Laughs with Priya", bio: "Stand-up comic. Clips from my sets 🎤",
    captions: ["My mom reviewing my dating life", "Desi weddings are a cardio event", "Crowd work in Toronto went sideways"],
  },
  {
    id: "ES-FOOD", kind: "multilingual (Spanish)", heldOut: false,
    displayName: "Cocina de Lupita", bio: "Recetas caseras de Puebla 🇲🇽 como las hacía mi abuela",
    captions: ["Mole poblano como lo hacía mi abuela", "Chiles en nogada para septiembre", "Tortillas a mano en 10 minutos"],
  },
  {
    id: "PT-FITNESS", kind: "multilingual (Portuguese)", heldOut: false,
    displayName: "Treino com Ana", bio: "Treinos em casa para mães ocupadas 💪 São Paulo",
    captions: ["Treino de 15 minutos sem equipamento", "Como voltei a treinar depois da gravidez", "Agachamento: erros comuns"],
  },
  { id: "SPARSE-BIO", kind: "sparse", heldOut: false, displayName: "Jordan", bio: "fitness 💪", captions: [] },
  {
    id: "SPARSE-NICHE", kind: "sparse + picked niche", heldOut: false,
    displayName: "Kitchen Diaries", bio: null, captions: ["Sunday prep", "new knife"], niche: "Home cooking",
  },
  // Fresh held-out profiles (not seen when the review prompt was written).
  {
    id: "HO-NOLA", kind: "local food", heldOut: true,
    displayName: "Eat NOLA with Dre", bio: "New Orleans eats ⚜️ po'boys, beignets & second lines",
    captions: ["Best po'boy in Mid-City", "Jazz Fest weekend survival guide", "Where locals actually get beignets"],
  },
  {
    id: "HO-SAAS", kind: "founder, build in public", heldOut: true,
    displayName: "Ravi | building Shipfast", bio: "Founder @Shipfast. Sharing what I learn building a SaaS in public.",
    captions: ["Month 6 revenue update", "Why we killed our free plan", "The cold email that got us 40 demos"],
  },
  {
    id: "HO-KPOP", kind: "people / group names", heldOut: true,
    displayName: "Mina Dances", bio: "K-pop dance covers 💃 NewJeans, Stray Kids, LE SSERAFIM",
    captions: ["Super Shy dance tutorial (slow + mirrored)", "Stray Kids S-Class chorus breakdown", "Learning a new choreo in 1 hour"],
  },
  {
    id: "HO-FR-TRAVEL", kind: "multilingual (French)", heldOut: true,
    displayName: "Les voyages de Léa", bio: "Voyager en Europe sans se ruiner ✈️ depuis Lyon",
    captions: ["Lisbonne en 3 jours avec 200€", "Les trains de nuit en Europe : mode d'emploi", "Mes 5 astuces pour des vols pas chers"],
  },
  {
    id: "HO-GROOMER", kind: "local business", heldOut: true,
    displayName: "Pawfect Mobile Grooming", bio: "Mobile dog grooming in Austin, TX 🐶 Book online",
    captions: ["Doodle de-matting before and after", "Why we never shave double coats", "A day in the grooming van"],
  },
  { id: "HO-NAME-ONLY", kind: "sparse (name only)", heldOut: true, displayName: "Chris Bakes", bio: null, captions: [] },
];

type Label = "supported" | "unsupported" | "uncertain";
/** PROPOSED human labels: to be confirmed or corrected by a person before the numbers count. */
const CLAIMS: Array<{ caseId: string; claim: string; label: Label; why: string }> = [
  // First run (18).
  { caseId: "LOCAL-HOU", claim: "Help locals discover Houston's best free events and festivals.", label: "supported", why: "possessive; bio + '5 free things'" },
  { caseId: "LOCAL-HOU", claim: "Show Houstonians the city's festivals, food and culture.", label: "supported", why: "demonym" },
  { caseId: "LOCAL-HOU", claim: "Help Texans find fun weekend events around Houston.", label: "supported", why: "Texas named; fair generalisation" },
  { caseId: "LOCAL-HOU", claim: "Share Day of the Dead celebrations and other Houston traditions.", label: "supported", why: "translation" },
  { caseId: "LOCAL-HOU", claim: "Help Austin locals find weekend events.", label: "unsupported", why: "wrong city" },
  { caseId: "LOCAL-HOU", claim: "Grow bookings for my Houston event tickets business.", label: "unsupported", why: "invented business" },
  { caseId: "LOCAL-HOU", claim: "Share the best of Rice Village and the Galleria for 50,000 followers.", label: "unsupported", why: "invented places + number" },
  { caseId: "FILM", claim: "Help movie fans understand why Villeneuve's and Nolan's films work.", label: "supported", why: "possessives of named directors" },
  { caseId: "FILM", claim: "Break down A24 films and blockbusters for curious viewers.", label: "supported", why: "A24 + Dune/Oppenheimer" },
  { caseId: "FILM", claim: "Review Marvel and Netflix releases every week.", label: "unsupported", why: "invented brands" },
  { caseId: "ES-FOOD", claim: "Teach traditional Pueblan home recipes passed down from grandma.", label: "supported", why: "demonym + translation" },
  { caseId: "ES-FOOD", claim: "Share Mexican family recipes like mole and chiles en nogada.", label: "supported", why: "flag + dishes" },
  { caseId: "ES-FOOD", claim: "Sell Lupita's Mole jars and grow online orders.", label: "unsupported", why: "invented product" },
  { caseId: "LOCAL-DFW-AGENT", claim: "Help first-time buyers in Dallas–Fort Worth find their first home.", label: "supported", why: "bio" },
  { caseId: "LOCAL-DFW-AGENT", claim: "Help first-time DFW buyers and get new clients for my real estate business.", label: "supported", why: "realtor + free consult" },
  { caseId: "LOCAL-DFW-AGENT", claim: "Help luxury buyers in Austin find waterfront homes.", label: "unsupported", why: "wrong city + segment" },
  { caseId: "COMEDY", claim: "Make people laugh with stand-up about family, dating and Desi weddings.", label: "supported", why: "captions" },
  { caseId: "COMEDY", claim: "Promote my Netflix special and sell tour tickets.", label: "unsupported", why: "invented brand + sales" },
  // Held-out (fresh).
  { caseId: "HO-NOLA", claim: "Show people where to eat po'boys and beignets in NOLA.", label: "supported", why: "abbreviation" },
  { caseId: "HO-NOLA", claim: "Share New Orleans food and festival culture, from Mid-City to Jazz Fest.", label: "supported", why: "captions" },
  { caseId: "HO-NOLA", claim: "Grow reservations for my New Orleans restaurant.", label: "unsupported", why: "invented business" },
  { caseId: "HO-NOLA", claim: "Share Mardi Gras parade guides for tourists.", label: "unsupported", why: "event + audience not shown" },
  { caseId: "HO-SAAS", claim: "Share lessons from building a SaaS startup in public.", label: "supported", why: "bio" },
  { caseId: "HO-SAAS", claim: "Show the real numbers and decisions behind growing Shipfast.", label: "supported", why: "revenue update, free plan" },
  { caseId: "HO-SAAS", claim: "Teach marketers how to run Facebook ads.", label: "unsupported", why: "audience + topic invented" },
  { caseId: "HO-SAAS", claim: "Help other founders avoid early startup mistakes.", label: "uncertain", why: "plausible audience, not stated" },
  { caseId: "HO-KPOP", claim: "Teach K-pop choreography from groups like NewJeans and Stray Kids.", label: "supported", why: "bio + tutorials" },
  { caseId: "HO-KPOP", claim: "Share BTS and BLACKPINK dance covers.", label: "unsupported", why: "invented groups" },
  { caseId: "HO-FR-TRAVEL", claim: "Help people travel around Europe on a budget, by night train and cheap flights.", label: "supported", why: "translation of captions" },
  { caseId: "HO-FR-TRAVEL", claim: "Montrer comment voyager en Europe pour pas cher.", label: "supported", why: "French paraphrase of bio" },
  { caseId: "HO-FR-TRAVEL", claim: "Sell guided tour packages to Lisbon.", label: "unsupported", why: "invented business" },
  { caseId: "HO-GROOMER", claim: "Help Austin dog owners keep their dogs comfortable and well groomed.", label: "supported", why: "local business, dog owners implied" },
  { caseId: "HO-GROOMER", claim: "Get more mobile grooming bookings in Austin.", label: "supported", why: "'Book online' shows the business" },
  { caseId: "HO-GROOMER", claim: "Train puppies and fix barking problems.", label: "unsupported", why: "different service" },
  { caseId: "SPARSE-BIO", claim: "Share fitness tips and motivation.", label: "uncertain", why: "starter direction for 'fitness'" },
  { caseId: "SPARSE-BIO", claim: "Help busy moms lose baby weight.", label: "unsupported", why: "invented audience" },
  { caseId: "SPARSE-NICHE", claim: "Share home cooking from my kitchen.", label: "supported", why: "picked niche" },
  { caseId: "SPARSE-NICHE", claim: "Teach quick weeknight dinners.", label: "uncertain", why: "plausible, not shown" },
];
/** Claims re-run 3 times for consistency. */
const REPEAT = new Set([1, 2, 3, 5, 7, 10, 18, 21, 25, 29, 34, 37]);
/** Profiles whose Goal (flag on) is re-run 3 times. */
const REPEAT_CASES = new Set(["LOCAL-HOU", "FILM", "SPARSE-BIO", "HO-SAAS"]);

function arg(name: string): string | null {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : process.argv.includes(`--${name}`) ? "true" : null;
}

function snapshotFor(c: Case): AnalysisSourceSnapshot {
  return {
    version: 1, platform: "instagram", handle: "synthetic", followerCount: null, windowStart: "", windowEnd: "",
    posts: c.captions.map((caption, i) => ({
      postId: String(i), url: null, publishedAt: null, views: 1000 - i * 10, likes: null, comments: null, durationSec: null, caption,
    })),
    profileEvidence: {
      username: "synthetic", displayName: c.displayName, bio: c.bio, category: null, cta: verbatimCta(c.bio),
      websiteUrl: null, captions: c.captions.slice(0, 6),
    },
  } as AnalysisSourceSnapshot;
}

function evidenceFor(c: Case): CreatorEvidence {
  const items = c.niche
    ? [{ id: "n1", kind: "niche", status: "confirmed", source: "user", payload: { label: c.niche } }]
    : [];
  return buildCreatorEvidence({
    platform: "instagram", displayName: c.displayName, bio: c.bio, snapshot: snapshotFor(c), items: items as never,
  });
}

let spent = 0;
let cap = 1.2;
const PRICE = { sonnet: { in: 3 / 1e6, out: 15 / 1e6 }, haiku: { in: 1 / 1e6, out: 5 / 1e6 } };

/** Real model calls, with cost and time recorded per operation. */
function meter() {
  const log: Array<{ op: string; model: string; ms: number; usd: number }> = [];
  const invoker: LlmInvoker = async params => {
    const { invokeLLM } = await import("../server/_core/llm");
    const t = Date.now();
    const r = await invokeLLM(params);
    const p = /haiku/i.test(String(params.model ?? r.model)) ? PRICE.haiku : PRICE.sonnet;
    const u = r.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    const usd = (u?.prompt_tokens ?? 0) * p.in + (u?.completion_tokens ?? 0) * p.out;
    spent += usd;
    log.push({ op: String(params.operation ?? "?"), model: String(params.model ?? r.model), ms: Date.now() - t, usd });
    if (spent > cap) throw new Error(`spend cap reached ($${spent.toFixed(4)})`);
    return r;
  };
  return { invoker, log };
}

const pct = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const short = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function partA() {
  console.log("\n## Part A: labelled claims (labels are PROPOSED; please confirm)\n");
  const m = meter();
  const byCase = new Map(CASES.map(c => [c.id, evidenceFor(c)]));
  const rows: Array<{ i: number; label: Label; verdicts: string[]; word: boolean; heldOut: boolean }> = [];
  for (const [i, c] of CLAIMS.entries()) {
    const e = byCase.get(c.caseId)!;
    const times = REPEAT.has(i) ? 3 : 1;
    const verdicts: string[] = [];
    for (let k = 0; k < times; k++) {
      const r = await reviewClaims({ evidenceText: supportEvidenceText(e, EMPTY_POST_CONTEXT), claims: [c.claim], invoker: m.invoker });
      verdicts.push(r.reviews[0]?.verdict ?? "unavailable");
    }
    // Current deterministic word check (what production runs today).
    const word =
      unsupportedProperNouns(c.claim, e.corpus, [e.outputLanguage.label]).length === 0 &&
      unsupportedNumbers(c.claim, e.corpus).length === 0;
    const heldOut = CASES.find(x => x.id === c.caseId)!.heldOut;
    rows.push({ i, label: c.label, verdicts, word, heldOut });
    console.log(
      `${String(i).padStart(2)} ${heldOut ? "HO " : "   "}${c.caseId.padEnd(16)} label=${c.label.padEnd(11)} review=${verdicts.join("/").padEnd(32)} wordCheck=${word ? "pass" : "REJECT"}  ${short(c.claim, 80)}`
    );
  }
  const first = (r: (typeof rows)[number]) => r.verdicts[0];
  const keepOk = (label: Label) => label !== "unsupported";
  const score = (subset: typeof rows, name: string) => {
    const exact = subset.filter(r => first(r) === r.label).length;
    const falseReject = subset.filter(r => keepOk(r.label) && first(r) === "unsupported");
    const falseAccept = subset.filter(r => !keepOk(r.label) && first(r) !== "unsupported");
    const wordFalseReject = subset.filter(r => keepOk(r.label) && !r.word);
    const wordFalseAccept = subset.filter(r => !keepOk(r.label) && r.word);
    console.log(
      `\n${name} (${subset.length} claims): review exact label match ${exact}/${subset.length}; ` +
        `review false rejections ${falseReject.length} [${falseReject.map(r => r.i).join(",")}], false accepts ${falseAccept.length} [${falseAccept.map(r => r.i).join(",")}]. ` +
        `Current word check: false rejections ${wordFalseReject.length} [${wordFalseReject.map(r => r.i).join(",")}], misses ${wordFalseAccept.length} [${wordFalseAccept.map(r => r.i).join(",")}].`
    );
  };
  score(rows.filter(r => !r.heldOut), "First-run claims");
  score(rows.filter(r => r.heldOut), "Held-out claims");
  score(rows, "All claims");
  const repeated = rows.filter(r => r.verdicts.length > 1);
  const stable = repeated.filter(r => new Set(r.verdicts).size === 1).length;
  console.log(`Consistency: ${stable}/${repeated.length} repeated claims gave the same verdict 3 times.`);
  const ms = m.log.map(x => x.ms);
  const usd = m.log.map(x => x.usd);
  console.log(
    `Review call: ${m.log.length} calls, latency p50 ${pct(ms, 0.5)} ms, p90 ${pct(ms, 0.9)} ms, max ${pct(ms, 1)} ms; cost avg $${(usd.reduce((a, b) => a + b, 0) / Math.max(1, usd.length)).toFixed(5)} per call.`
  );
}

async function runGoal(c: Case, flag: boolean) {
  process.env.ONBOARDING_CLAIM_SUPPORT = flag ? "on" : "off";
  const m = meter();
  const t = Date.now();
  const rejections: string[] = [];
  let out: string;
  let goalText: string | null = null;
  try {
    const r = await inferGoal({ evidence: evidenceFor(c), invoker: m.invoker, reviewInvoker: m.invoker, onRejected: why => rejections.push(why) });
    if (r.status === "suggested") {
      goalText = r.goal;
      out = `${r.starter ? "STARTER" : "suggest"}(${r.confidence}) "${r.goal}"`;
    } else out = `ASK[${r.reason}] "${short(r.question, 60)}"`;
  } catch (err) {
    out = `FAILED ${err instanceof Error ? short(err.message, 90) : "error"}`;
  }
  const ms = Date.now() - t;
  const usd = m.log.reduce((a, b) => a + b.usd, 0);
  const reviews = m.log.filter(x => x.op === "personalization_claim_support").length;
  return { out, goalText, ms, usd, attempts: m.log.filter(x => x.op !== "personalization_claim_support").length, reviews, rejections };
}

async function runAudience(c: Case, flag: boolean, goal: string) {
  process.env.ONBOARDING_CLAIM_SUPPORT = flag ? "on" : "off";
  const m = meter();
  const t = Date.now();
  let out: string;
  try {
    const r = await recommendAudiences({ evidence: evidenceFor(c), confirmedGoal: goal, confirmedAudiences: [], invoker: m.invoker, reviewInvoker: m.invoker });
    out = `${r.audiences.length} (${r.confidence}): ${r.audiences.map(a => a.who).join(" | ")}`;
  } catch (err) {
    out = `FAILED ${err instanceof Error ? short(err.message, 90) : "error"}`;
  }
  return { out, ms: Date.now() - t, usd: m.log.reduce((a, b) => a + b.usd, 0) };
}

async function partB() {
  console.log("\n## Part B: real Goal and Audience code, flag off vs on\n");
  const tot = { off: { ms: [] as number[], usd: 0 }, on: { ms: [] as number[], usd: 0 } };
  const atot = { off: { ms: [] as number[], usd: 0 }, on: { ms: [] as number[], usd: 0 } };
  for (const c of CASES) {
    console.log(`### ${c.id} (${c.kind}${c.heldOut ? ", held-out" : ""})`);
    const off = await runGoal(c, false);
    const on = await runGoal(c, true);
    for (const [name, r] of [["off", off], ["on ", on]] as const) {
      console.log(`  goal ${name}: ${r.out}  [writer calls ${r.attempts}, reviews ${r.reviews}, ${r.ms} ms, $${r.usd.toFixed(4)}]`);
      for (const why of r.rejections) console.log(`      rejected: ${short(why, 120)}`);
    }
    tot.off.ms.push(off.ms); tot.off.usd += off.usd; tot.on.ms.push(on.ms); tot.on.usd += on.usd;
    if (REPEAT_CASES.has(c.id)) {
      const again = [on.out];
      for (let k = 0; k < 2; k++) again.push((await runGoal(c, true)).out);
      console.log(`  repeat (on) x3: ${again.map(o => o.split(" ")[0]).join(" / ")}`);
    }
    const goal = on.goalText ?? off.goalText;
    if (goal) {
      const aOff = await runAudience(c, false, goal);
      const aOn = await runAudience(c, true, goal);
      console.log(`  audience off: ${short(aOff.out, 150)}  [${aOff.ms} ms, $${aOff.usd.toFixed(4)}]`);
      console.log(`  audience on : ${short(aOn.out, 150)}  [${aOn.ms} ms, $${aOn.usd.toFixed(4)}]`);
      atot.off.ms.push(aOff.ms); atot.off.usd += aOff.usd; atot.on.ms.push(aOn.ms); atot.on.usd += aOn.usd;
    } else console.log("  audience: skipped (no goal text)");
  }
  const line = (name: string, x: { ms: number[]; usd: number }) =>
    `${name}: p50 ${pct(x.ms, 0.5)} ms, p90 ${pct(x.ms, 0.9)} ms, max ${pct(x.ms, 1)} ms, avg $${(x.usd / Math.max(1, x.ms.length)).toFixed(4)} per profile`;
  console.log(`\nGoal step ${line("flag off", tot.off)}`);
  console.log(`Goal step ${line("flag on ", tot.on)}`);
  console.log(`Audience step ${line("flag off", atot.off)}`);
  console.log(`Audience step ${line("flag on ", atot.on)}`);
}

async function main() {
  if (!arg("confirm-spend")) throw new Error("pass --confirm-spend");
  cap = Number(arg("cap") ?? "1.2");
  try {
    await partA();
    await partB();
  } finally {
    console.log(`\nEstimated spend: $${spent.toFixed(4)} (cap $${cap})`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
