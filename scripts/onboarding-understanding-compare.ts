/**
 * Read-only investigation (synthetic profiles only, no DB, no production):
 * the CURRENT onboarding goal pipeline vs a simple, well-written prompt on the
 * same evidence, plus a validator test set of valid paraphrases and genuinely
 * invented claims. Prints a report; spend capped by --cap.
 *
 *   pnpm exec tsx scripts/onboarding-understanding-compare.ts --confirm-spend --cap=0.60
 */
import type { AnalysisSourceSnapshot } from "../shared/personalization/model";
import { buildCreatorEvidence, verbatimCta, type CreatorEvidence } from "../server/personalization/intelligence/evidence";
import { inferGoal } from "../server/personalization/intelligence/goalInference";
import { postIndex, postIndexPayload } from "../server/personalization/intelligence/postVisuals";
import { unsupportedNumbers, unsupportedProperNouns } from "../server/personalization/intelligence/guards";
import type { LlmInvoker } from "../server/personalization/intelligence/structuredLlm";

type Case = { id: string; kind: string; displayName: string | null; bio: string | null; captions: string[]; niche?: string };

const CASES: Case[] = [
  {
    id: "LOCAL-HOU", kind: "local events",
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
    id: "LOCAL-DFW-AGENT", kind: "local business",
    displayName: "Maya Brooks | DFW Realtor", bio: "Helping first-time buyers in Dallas–Fort Worth 🏡 DM 'HOME' for a free consult",
    captions: ["What $350k buys you in Frisco vs Plano", "3 mistakes first-time buyers make in DFW", "Closing day with the Nguyens!"],
  },
  {
    id: "FILM", kind: "people / film names",
    displayName: "Reel Talk with Sam", bio: "Movie breakdowns 🎬 Villeneuve, Nolan, A24",
    captions: [
      "Why the sandworm ride in Dune: Part Two works",
      "Oppenheimer's sound design is doing something sneaky",
      "Past Lives ending explained",
      "Ranking every Christopher Nolan movie",
    ],
  },
  {
    id: "COMEDY", kind: "people names",
    displayName: "Laughs with Priya", bio: "Stand-up comic. Clips from my sets 🎤",
    captions: ["My mom reviewing my dating life", "Desi weddings are a cardio event", "Crowd work in Toronto went sideways"],
  },
  {
    id: "ES-FOOD", kind: "multilingual (Spanish)",
    displayName: "Cocina de Lupita", bio: "Recetas caseras de Puebla 🇲🇽 como las hacía mi abuela",
    captions: ["Mole poblano como lo hacía mi abuela", "Chiles en nogada para septiembre", "Tortillas a mano en 10 minutos"],
  },
  {
    id: "PT-FITNESS", kind: "multilingual (Portuguese)",
    displayName: "Treino com Ana", bio: "Treinos em casa para mães ocupadas 💪 São Paulo",
    captions: ["Treino de 15 minutos sem equipamento", "Como voltei a treinar depois da gravidez", "Agachamento: erros comuns"],
  },
  { id: "SPARSE-BIO", kind: "sparse", displayName: "Jordan", bio: "fitness 💪", captions: [] },
  {
    id: "SPARSE-NICHE", kind: "sparse + picked niche",
    displayName: "Kitchen Diaries", bio: null, captions: ["Sunday prep", "new knife"], niche: "Home cooking",
  },
];

/** Claims a validator must judge: valid paraphrases (supported) and inventions (unsupported). */
const VALIDATOR_SET: Array<{ caseId: string; claim: string; supported: boolean }> = [
  { caseId: "LOCAL-HOU", claim: "Help locals discover Houston's best free events and festivals.", supported: true },
  { caseId: "LOCAL-HOU", claim: "Show Houstonians the city's festivals, food and culture.", supported: true },
  { caseId: "LOCAL-HOU", claim: "Help Texans find fun weekend events around Houston.", supported: true },
  { caseId: "LOCAL-HOU", claim: "Share Day of the Dead celebrations and other Houston traditions.", supported: true },
  { caseId: "LOCAL-HOU", claim: "Help Austin locals find weekend events.", supported: false },
  { caseId: "LOCAL-HOU", claim: "Grow bookings for my Houston event tickets business.", supported: false },
  { caseId: "LOCAL-HOU", claim: "Share the best of Rice Village and the Galleria for 50,000 followers.", supported: false },
  { caseId: "FILM", claim: "Help movie fans understand why Villeneuve's and Nolan's films work.", supported: true },
  { caseId: "FILM", claim: "Break down A24 films and blockbusters for curious viewers.", supported: true },
  { caseId: "FILM", claim: "Review Marvel and Netflix releases every week.", supported: false },
  { caseId: "ES-FOOD", claim: "Teach traditional Pueblan home recipes passed down from grandma.", supported: true },
  { caseId: "ES-FOOD", claim: "Share Mexican family recipes like mole and chiles en nogada.", supported: true },
  { caseId: "ES-FOOD", claim: "Sell Lupita's Mole jars and grow online orders.", supported: false },
  { caseId: "LOCAL-DFW-AGENT", claim: "Help first-time buyers in Dallas–Fort Worth find their first home.", supported: true },
  { caseId: "LOCAL-DFW-AGENT", claim: "Help first-time DFW buyers and get new clients for my real estate business.", supported: true },
  { caseId: "LOCAL-DFW-AGENT", claim: "Help luxury buyers in Austin find waterfront homes.", supported: false },
  { caseId: "COMEDY", claim: "Make people laugh with stand-up about family, dating and Desi weddings.", supported: true },
  { caseId: "COMEDY", claim: "Promote my Netflix special and sell tour tickets.", supported: false },
];

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
let cap = 0.6;
const PRICE: Record<string, { in: number; out: number }> = {
  sonnet: { in: 3 / 1e6, out: 15 / 1e6 },
  haiku: { in: 1 / 1e6, out: 5 / 1e6 },
};
function charge(model: string, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined) {
  const p = /haiku/i.test(model) ? PRICE.haiku : PRICE.sonnet;
  spent += (usage?.prompt_tokens ?? 0) * p.in + (usage?.completion_tokens ?? 0) * p.out;
  if (spent > cap) throw new Error(`spend cap reached ($${spent.toFixed(4)})`);
}

function text(result: { choices: Array<{ message?: { content?: unknown } }> }): string {
  const c = result.choices[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(x => (x && typeof x === "object" && "text" in x ? String((x as { text: string }).text) : "")).join("");
  return "";
}

async function main() {
  if (!arg("confirm-spend")) throw new Error("pass --confirm-spend");
  cap = Number(arg("cap") ?? "0.6");
  const { invokeLLM } = await import("../server/_core/llm");
  const HAIKU = "claude-haiku-4-5-20251001";

  const judge = async (evidenceText: string, claim: string) => {
    const t0 = Date.now();
    const r = await invokeLLM({
      model: HAIKU, maxTokens: 200, temperature: 0, response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You check whether a one-line creator summary is SUPPORTED by the creator\'s public evidence. Paraphrases, translations (e.g. "Day of the Dead" for "Dia de los Muertos"), demonyms ("Houstonians", "Texans"), possessives and reasonable generalisations of what the evidence shows are supported. A claim is UNSUPPORTED if it names a place, person, brand, product, number, or business/sales objective that the evidence does not show. Return ONLY JSON {"supported": true|false, "unsupported": ["exact words that are not supported"]}.',
        },
        { role: "user", content: `EVIDENCE:\n${evidenceText}\n\nCLAIM:\n${claim}` },
      ],
    });
    charge(HAIKU, r.usage as never);
    let parsed: { supported?: boolean; unsupported?: string[] } = {};
    try { parsed = JSON.parse(text(r as never).replace(/^```json|```$/g, "")); } catch { /* keep empty */ }
    return { supported: parsed.supported !== false, unsupported: parsed.unsupported ?? [], ms: Date.now() - t0 };
  };

  const evidenceText = (e: CreatorEvidence) => e.snippets.map(s => `[${s.source}] ${s.text}`).join("\n");

  console.log(`\n=== A. Current goal pipeline vs a simple prompt (same evidence) ===\n`);
  const rows: string[] = [];
  for (const c of CASES) {
    const e = evidenceFor(c);
    const snapshot = snapshotFor(c);
    const posts = { posts: postIndex(snapshot, snapshot.profileEvidence), images: [] };

    // Current pipeline, capturing every model draft and every rejection.
    const drafts: string[] = [];
    const rejections: string[] = [];
    const invoker: LlmInvoker = async params => {
      const r = await invokeLLM(params);
      charge("sonnet", r.usage as never);
      drafts.push(text(r as never));
      return r;
    };
    const t0 = Date.now();
    let current = "";
    try {
      const g = await inferGoal({ evidence: e, posts, invoker, onRejected: reason => rejections.push(reason) });
      current = g.status === "suggested" ? `SUGGESTED: ${g.goal}` : `ASKED: ${g.question}`;
    } catch (err) {
      current = `FAILED (empty box): ${err instanceof Error ? err.message : String(err)}`;
    }
    const currentMs = Date.now() - t0;

    // Simple, well-written prompt on the same evidence.
    const t1 = Date.now();
    const simple = await invokeLLM({
      maxTokens: 400, temperature: 0, response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You read a short-form video creator's public profile and posts and write three short, separate suggestions the creator will confirm or edit:",
            '- "purpose": WHY they create, one sentence (max 18 words) starting with a verb (Help, Show, Teach, Share, Entertain...).',
            '- "audience": WHO they serve, a short phrase.',
            '- "subject": WHAT they cover, a short phrase.',
            "Use only what the evidence shows. Natural paraphrase is fine (e.g. \"Houstonians\", a translation of a non-English phrase).",
            "Do not invent places, people, brands, numbers, or a business/sales goal. Mention customers, clients or sales only if the bio or name shows they sell something.",
            "Write in English even if the evidence is in another language.",
            'If the evidence does not say what the content is about, set "question" to one short question and leave the rest empty.',
            'Return ONLY JSON {"purpose":"","audience":"","subject":"","question":""}.',
          ].join("\n"),
        },
        { role: "user", content: `${evidenceText(e)}\n\nPosts (most viewed first):\n${JSON.stringify(postIndexPayload(posts.posts, []))}` },
      ],
    });
    charge("sonnet", simple.usage as never);
    const simpleMs = Date.now() - t1;
    let s: { purpose?: string; audience?: string; subject?: string; question?: string } = {};
    try { s = JSON.parse(text(simple as never).replace(/^```json|```$/g, "")); } catch { /* keep empty */ }

    // Independent support check for every final answer and every rejected draft.
    const draftGoals = drafts.map(d => { try { return String(JSON.parse(d).goal ?? ""); } catch { return ""; } }).filter(Boolean);
    const checks = [];
    for (const g of draftGoals) checks.push({ who: "current draft", claim: g, ...(await judge(evidenceText(e), g)) });
    if (s.purpose) checks.push({ who: "simple purpose", claim: s.purpose, ...(await judge(evidenceText(e), s.purpose)) });

    rows.push(
      [
        `--- ${c.id} (${c.kind}) ---`,
        `evidence strength: ${e.strength}; sources: ${e.sources.join(", ")}`,
        `CURRENT  (${currentMs} ms, ${drafts.length} call(s)): ${current}`,
        ...rejections.map(r => `   rejected: ${r}`),
        ...draftGoals.map((g, i) => `   draft ${i + 1}: "${g}"`),
        `SIMPLE   (${simpleMs} ms, 1 call): purpose="${s.purpose ?? ""}" | audience="${s.audience ?? ""}" | subject="${s.subject ?? ""}"${s.question ? ` | question="${s.question}"` : ""}`,
        ...checks.map(k => `   support check [${k.who}] ${k.supported ? "SUPPORTED" : "UNSUPPORTED " + JSON.stringify(k.unsupported)} (${k.ms} ms): "${k.claim}"`),
      ].join("\n")
    );
  }
  console.log(rows.join("\n\n"));

  console.log(`\n=== B. Validator test set: valid paraphrases vs genuinely invented claims ===\n`);
  let nameOk = 0, judgeOk = 0;
  const judgeMs: number[] = [];
  for (const v of VALIDATOR_SET) {
    const c = CASES.find(x => x.id === v.caseId)!;
    const e = evidenceFor(c);
    const names = unsupportedProperNouns(v.claim, e.corpus, ["English"]);
    const nums = unsupportedNumbers(v.claim, e.corpus);
    const currentSays = names.length === 0 && nums.length === 0;
    const j = await judge(evidenceText(e), v.claim);
    judgeMs.push(j.ms);
    if (currentSays === v.supported) nameOk++;
    if (j.supported === v.supported) judgeOk++;
    console.log(
      `${v.supported ? "PARAPHRASE" : "INVENTED  "} | current check: ${currentSays ? "pass" : "REJECT " + JSON.stringify([...names, ...nums])} | support check: ${j.supported ? "pass" : "REJECT " + JSON.stringify(j.unsupported)} | ${v.caseId}: "${v.claim}"`
    );
  }
  judgeMs.sort((a, b) => a - b);
  console.log(
    `\nCurrent word check correct: ${nameOk}/${VALIDATOR_SET.length}. Support check correct: ${judgeOk}/${VALIDATOR_SET.length}. Support check latency p50 ${judgeMs[Math.floor(judgeMs.length / 2)]} ms, max ${judgeMs[judgeMs.length - 1]} ms.`
  );
  console.log(`Estimated spend: $${spent.toFixed(4)} (cap $${cap})`);
}

main().catch(err => {
  console.error(err);
  console.log(`Estimated spend: $${spent.toFixed(4)}`);
  process.exit(1);
});
