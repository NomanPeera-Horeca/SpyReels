/**
 * Local QA only. Not product code.
 * Compares Haiku vs Sonnet on targeted slot rewrites.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractCarouselRewriteFacts,
  preservesCarouselSubjectAnchors,
  type CarouselSlotRewriteAction,
  type CarouselSlotRewriteContext,
} from "../shared/carouselSlotRewrite";
import {
  CAROUSEL_SLOT_REWRITE_MODEL,
  CAROUSEL_SLOT_REWRITE_STRONG_MODEL,
  rewriteCarouselSlotCopy,
} from "../server/carousel/rewriteCarouselSlotCopy";

function loadAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return;
  for (const rel of [".env", "../reels-dashboard/.env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), rel), "utf8");
      const match = raw.match(/^ANTHROPIC_API_KEY=(.*)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, "");
      if (value) {
        process.env.ANTHROPIC_API_KEY = value;
        return;
      }
    } catch {
      // try the next file
    }
  }
}

loadAnthropicKey();

type Case = {
  id: string;
  action: CarouselSlotRewriteAction;
  role: "headline" | "kicker" | "body" | "cta";
  topic: string;
  currentText: string;
  max: number;
  sourceUrl?: string | null;
  niche?: string;
};

const CASES: Case[] = [
  {
    id: "A-pricing-punchier",
    action: "make_punchier",
    role: "headline",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Your menu price is costing you profit",
    max: 48,
  },
  {
    id: "B-labor-rewrite",
    action: "rewrite",
    role: "headline",
    topic: "Why restaurant labor costs keep rising",
    currentText: "Why restaurant labor costs keep rising",
    max: 52,
  },
  {
    id: "C-source-rewrite",
    action: "rewrite",
    role: "headline",
    topic: "The real cost of cheap restaurant equipment",
    currentText: "Cheap equipment looks smart until it fails",
    max: 56,
    sourceUrl: "https://example.com/cheap-restaurant-equipment",
  },
  {
    id: "D-story-punchier",
    action: "make_punchier",
    role: "headline",
    topic: "A first-year opening night story",
    currentText: "I thought I was ready. I wasn't.",
    max: 48,
    niche: "creators",
  },
  {
    id: "headline-shorter",
    action: "make_shorter",
    role: "headline",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Your menu price is costing you profit",
    max: 48,
  },
  {
    id: "headline-clearer",
    action: "make_clearer",
    role: "headline",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Your menu price is costing you profit",
    max: 48,
  },
  {
    id: "headline-rewrite",
    action: "rewrite",
    role: "headline",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Your menu price is costing you profit",
    max: 48,
  },
  {
    id: "kicker-punchier",
    action: "make_punchier",
    role: "kicker",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "PRICING",
    max: 22,
  },
  {
    id: "kicker-shorter",
    action: "make_shorter",
    role: "kicker",
    topic: "Why restaurant labor costs keep rising",
    currentText: "LABOR COSTS",
    max: 22,
  },
  {
    id: "kicker-clearer",
    action: "make_clearer",
    role: "kicker",
    topic: "Why restaurant labor costs keep rising",
    currentText: "LABOR TREND",
    max: 22,
  },
  {
    id: "kicker-rewrite",
    action: "rewrite",
    role: "kicker",
    topic: "Why restaurant labor costs keep rising",
    currentText: "LABOR",
    max: 18,
  },
  {
    id: "body-punchier",
    action: "make_punchier",
    role: "body",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Owners cut 12% off popular plates without knowing food cost.",
    max: 90,
  },
  {
    id: "body-shorter",
    action: "make_shorter",
    role: "body",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Owners cut 12% off popular plates without knowing food cost.",
    max: 90,
  },
  {
    id: "body-clearer",
    action: "make_clearer",
    role: "body",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Owners cut 12% off popular plates without knowing food cost.",
    max: 90,
  },
  {
    id: "body-rewrite",
    action: "rewrite",
    role: "body",
    topic: "Why restaurant labor costs keep rising",
    currentText: "Overtime keeps climbing because the schedule is still built around last year's covers.",
    max: 110,
  },
  {
    id: "cta-punchier",
    action: "make_punchier",
    role: "cta",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Save this before you reprint menus",
    max: 42,
  },
  {
    id: "cta-shorter",
    action: "make_shorter",
    role: "cta",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Save this before you reprint menus",
    max: 42,
  },
  {
    id: "cta-clearer",
    action: "make_clearer",
    role: "cta",
    topic: "Why restaurant labor costs keep rising",
    currentText: "Fix the schedule before next week's overtime hits",
    max: 48,
  },
  {
    id: "cta-rewrite",
    action: "rewrite",
    role: "cta",
    topic: "Why restaurant labor costs keep rising",
    currentText: "Fix the schedule before next week's overtime hits",
    max: 48,
  },
  {
    id: "story-shorter",
    action: "make_shorter",
    role: "headline",
    topic: "A first-year opening night story",
    currentText: "I thought I was ready. I wasn't.",
    max: 48,
    niche: "creators",
  },
  {
    id: "story-clearer",
    action: "make_clearer",
    role: "body",
    topic: "A first-year opening night story",
    currentText: "The first Friday looked busy. The ticket average said otherwise.",
    max: 90,
    niche: "creators",
  },
  {
    id: "alts-pricing",
    action: "alternatives",
    role: "headline",
    topic: "5 pricing mistakes restaurant owners make",
    currentText: "Your menu price is costing you profit",
    max: 48,
  },
];

function contextFor(row: Case): CarouselSlotRewriteContext {
  return {
    niche: row.niche ?? "restaurant owners",
    sourceUrl: row.sourceUrl ?? null,
    brief: {
      topic: row.topic,
      title: row.topic,
      hook: row.currentText,
      corePromise: row.topic,
      centralInsight: row.topic,
      ctaDirection: "Save this",
      prohibitedClaims: ["Do not invent revenue numbers"],
    },
    slide: {
      id: "slide_01",
      role: row.role === "cta" ? "cta" : "hook",
      viralWhy: row.topic,
      semanticRole: row.role === "cta" ? "cta" : "hook",
      family: "story_narrative",
      index: 0,
      total: 6,
    },
    slot: {
      id: row.role,
      role: row.role,
      label: row.role,
      budget: { min: 2, max: row.max },
      currentText: row.currentText,
    },
    nearby: { sameSlide: [], prevHeadline: null, nextHeadline: null },
    factsToPreserve: extractCarouselRewriteFacts(row.currentText),
  };
}

function scoreRow(
  row: Case,
  result: { text?: string; alternatives?: string[] } | { error: string }
) {
  if ("error" in result) {
    return {
      fidelity: 0,
      transform: 0,
      strength: 0,
      natural: 0,
      fit: 0,
      total: 0,
      note: result.error,
    };
  }
  const texts = result.alternatives ?? (result.text ? [result.text] : []);
  const original = row.currentText;
  let fidelity = 5;
  let transform = 5;
  let strength = 5;
  let natural = 5;
  let fit = 5;
  const topicBits = row.topic.toLowerCase();
  for (const text of texts) {
    const lower = text.toLowerCase();
    if (
      (topicBits.includes("menu") || topicBits.includes("pricing")) &&
      /instagram|creator|reel|follower/.test(lower)
    ) {
      fidelity -= 3;
    }
    if (topicBits.includes("labor") && /instagram|creator|reel|follower/.test(lower)) {
      fidelity -= 3;
    }
    if (!preservesCarouselSubjectAnchors(original, text)) {
      fidelity -= 4;
    }
    if (row.action === "make_shorter" && text.length >= original.length) transform -= 4;
    if (row.action === "make_punchier" && text.length > original.length + 8) strength -= 2;
    if (row.action === "make_punchier" && /\b(nearly|quite|really|actually|very)\b/i.test(text)) {
      strength -= 3;
    }
    if (text === original) transform -= 4;
    if (/[\u2014\u2013]/.test(text)) natural -= 2;
    if (text.length > row.max) fit -= 4;
    if (row.role === "headline" && text.length > original.length + 12) strength -= 1;
    if (row.role === "kicker" && /\b(the|this is|you should)\b/i.test(text)) natural -= 1;
    if (row.role === "cta" && !/\b(save|fix|check|read|share|try|start)\b/i.test(text)) {
      strength -= 1;
    }
  }
  if (row.action === "alternatives") {
    const unique = new Set(texts.map((item) => item.toLowerCase()));
    if (texts.length !== 3) transform -= 4;
    if (unique.size !== texts.length) transform -= 3;
    if (texts.some((item) => item === original)) transform -= 4;
  }
  const clamp = (n: number) => Math.max(0, Math.min(5, n));
  fidelity = clamp(fidelity);
  transform = clamp(transform);
  strength = clamp(strength);
  natural = clamp(natural);
  fit = clamp(fit);
  return {
    fidelity,
    transform,
    strength,
    natural,
    fit,
    total: fidelity + transform + strength + natural + fit,
    note: texts.join(" | "),
  };
}

async function runModel(model: string) {
  const rows: Array<Record<string, unknown>> = [];
  for (const row of CASES) {
    try {
      const result = await rewriteCarouselSlotCopy(row.action, contextFor(row), model);
      const scored = scoreRow(row, result);
      rows.push({
        id: row.id,
        action: row.action,
        role: row.role,
        original: row.currentText,
        ...result,
        ...scored,
      });
      console.log(
        `${model} ${row.id} ${scored.total}/25 ${scored.note}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed";
      const scored = scoreRow(row, { error: message });
      rows.push({
        id: row.id,
        action: row.action,
        role: row.role,
        original: row.currentText,
        error: message,
        ...scored,
      });
      console.log(`${model} ${row.id} FAIL ${message}`);
    }
  }
  const avg =
    rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0) / rows.length;
  return { model, avg, rows };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is missing");
  }
  console.log(`cases=${CASES.length}`);
  const haiku = await runModel(CAROUSEL_SLOT_REWRITE_MODEL);
  const sonnet = await runModel(CAROUSEL_SLOT_REWRITE_STRONG_MODEL);
  console.log(
    JSON.stringify(
      {
        haikuModel: CAROUSEL_SLOT_REWRITE_MODEL,
        sonnetModel: CAROUSEL_SLOT_REWRITE_STRONG_MODEL,
        haikuAvg: Number(haiku.avg.toFixed(2)),
        sonnetAvg: Number(sonnet.avg.toFixed(2)),
        haiku,
        sonnet,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
