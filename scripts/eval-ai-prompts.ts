import * as dotenv from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { routeNiche } from "../server/ai/prompts/niche-routing";
import { translateReel } from "../server/ai/prompts/translation";
import { judgeTranslation } from "../server/ai/prompts/judge";
import type {
  NicheRoutingInput,
  NicheRoutingOutput,
  TranslationInput,
  TranslationOutput,
  JudgeInput,
  JudgeOutput,
  Niche,
} from "../server/ai/types";

dotenv.config();

interface TestCase {
  id: string;
  label: string;
  businessDescription: string;
  reel: {
    creatorHandle: string;
    originalNiche: Niche;
    viewCount: number;
    engagementRate: number;
    caption: string;
    transcript: string;
  };
  expectedRelevanceType: "direct_match" | "pattern_match" | "stretch";
  notes: string;
}

const TEST_CASES: TestCase[] = [
  {
    id: "case-1-restaurant-equipment",
    label: "Restaurant equipment seller + Dan Martell sales reel (the Dan Martell test)",
    businessDescription:
      "I sell commercial kitchen equipment to restaurant owners and operators in the US. My customers are independent restaurant owners running 1 to 5 locations who care about food cost, kitchen efficiency, and staff turnover.",
    reel: {
      creatorHandle: "danmartell",
      originalNiche: "Business & Entrepreneurship",
      viewCount: 1200000,
      engagementRate: 0.041,
      caption:
        "5 words you should never use in sales. Number 5 will surprise you. Save this before your next call.",
      transcript:
        "5 words you should never use in sales. Number 1, the word try. When you say I will try, you sound weak. Replace it with I will. Number 2, the word but. But erases everything you said before it. Use and instead. Number 3, the word just. I am just calling to check in. Just makes you sound small. Drop it. Number 4, the word hopefully. Hopefully we can close this. Hopefully is a wish, not a plan. Number 5, the word honestly. Honestly suggests you were lying before. Be direct without flagging it. Try this on your next call.",
    },
    expectedRelevanceType: "pattern_match",
    notes:
      "This is the canonical test. Original is about sales, user is in restaurant equipment B2B. The pattern (5 words you should never use) is universal. The translation should propose something like '5 words you should never put on your restaurant menu' or similar.",
  },
  {
    id: "case-2-wedding-photographer",
    label: "Wedding photographer in Dubai + lifestyle creator reel",
    businessDescription:
      "I am a wedding photographer based in Dubai. I shoot luxury weddings for South Asian and Arab couples. My target audience is brides planning weddings in Dubai with budgets above 50k USD for photography alone.",
    reel: {
      creatorHandle: "luxurybridegoals",
      originalNiche: "Fashion & Style",
      viewCount: 850000,
      engagementRate: 0.062,
      caption:
        "Three signs your wedding venue is overpriced. Number 2 nobody tells you about.",
      transcript:
        "Three signs your wedding venue is overpriced and the planner is taking a cut. Number 1, they refuse to itemize the quote. If they say it is all inclusive but will not break it down, they are hiding markup. Number 2, the vendor list is closed. Any venue that forces you to use their photographer, florist, and caterer is keeping a 30 to 40 percent kickback from each. Number 3, the deposit is non refundable from day one. Real venues protect their dates but real venues also have escalation terms. If they want 50 percent locked from signing, walk away. Send this to your bride friends before they pick their venue.",
    },
    expectedRelevanceType: "pattern_match",
    notes:
      "User is a photographer but the buyer (the bride) is reading wedding planning content, not photography content. The translation should propose something like 'Three signs your wedding photographer is overpriced' aimed at brides selecting photographers. Tests whether AI correctly identifies that the user's buyer attention is in lifestyle, not in their literal industry.",
  },
  {
    id: "case-3-dental-saas-stretch",
    label: "B2B dental SaaS + comedy reel (deliberate stretch)",
    businessDescription:
      "I built a SaaS product for dental practices that automates patient reminders and reactivation campaigns. I sell to independent dentists and small DSO operators in the US. My users are practice owners and office managers.",
    reel: {
      creatorHandle: "comedygenz",
      originalNiche: "Comedy & Memes",
      viewCount: 3400000,
      engagementRate: 0.089,
      caption:
        "When your toxic ex texts you on a Tuesday. POV the group chat reactions.",
      transcript:
        "POV your toxic ex texts you on a Tuesday. You see the notification. You squint. You read it three times. You scroll up to last conversation from six months ago. You screenshot. You send to the group chat. The group chat erupts. Sarah says block him. Emily says reply with a confused face. Jen says do nothing it is what he wants. You stare at the screen. You start typing. You delete it. You start typing again. You delete it. You put the phone down. You pick it up. You black out. You reply with a single dot.",
    },
    expectedRelevanceType: "stretch",
    notes:
      "This is a stretch test. Comedy reels generally do not translate to B2B SaaS for dentists. The AI should grade this as 'stretch' with low confidence, OR the judge should REJECT_HIDE it. If the AI tries to force a translation here, it reveals the prompt is not honest enough.",
  },
];

function separator(label: string): string {
  const line = "=".repeat(80);
  return `\n${line}\n${label}\n${line}\n`;
}

function subSeparator(label: string): string {
  const line = "-".repeat(80);
  return `\n${line}\n${label}\n${line}`;
}

interface CaseResult {
  testCaseId: string;
  testCaseLabel: string;
  nicheRouting: NicheRoutingOutput | { error: string };
  translation: TranslationOutput | { error: string } | null;
  judge: JudgeOutput | { error: string } | null;
  durationMs: number;
}

async function runOneCase(testCase: TestCase): Promise<CaseResult> {
  const startedAt = Date.now();
  console.log(separator(`TEST CASE: ${testCase.label}`));
  console.log(`Business description:\n${testCase.businessDescription}\n`);
  console.log(`Reel: @${testCase.reel.creatorHandle} (${testCase.reel.originalNiche})`);
  console.log(`Views: ${testCase.reel.viewCount.toLocaleString()}, ER: ${(testCase.reel.engagementRate * 100).toFixed(2)}%`);
  console.log(`Expected relevance type: ${testCase.expectedRelevanceType}`);
  console.log(`Notes: ${testCase.notes}`);

  // Step 1: Niche routing
  console.log(subSeparator("STEP 1: NICHE ROUTING"));
  let nicheRouting: NicheRoutingOutput;
  try {
    const nicheInput: NicheRoutingInput = {
      businessDescription: testCase.businessDescription,
    };
    nicheRouting = await routeNiche(nicheInput);
    console.log(JSON.stringify(nicheRouting, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`ERROR: ${message}`);
    return {
      testCaseId: testCase.id,
      testCaseLabel: testCase.label,
      nicheRouting: { error: message },
      translation: null,
      judge: null,
      durationMs: Date.now() - startedAt,
    };
  }

  // Step 2: Translation
  console.log(subSeparator("STEP 2: TRANSLATION"));
  let translation: TranslationOutput;
  try {
    const translationInput: TranslationInput = {
      userBusinessDescription: testCase.businessDescription,
      audienceWhoTheySellTo: nicheRouting.audience.who_they_sell_to,
      audiencePersonaKeywords: nicheRouting.audience.audience_persona_keywords,
      businessType: nicheRouting.business_type,
      reelCreatorHandle: testCase.reel.creatorHandle,
      reelOriginalNiche: testCase.reel.originalNiche,
      reelViewCount: testCase.reel.viewCount,
      reelEngagementRate: testCase.reel.engagementRate,
      reelCaption: testCase.reel.caption,
      reelTranscript: testCase.reel.transcript,
    };
    translation = await translateReel(translationInput);
    console.log(JSON.stringify(translation, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`ERROR: ${message}`);
    return {
      testCaseId: testCase.id,
      testCaseLabel: testCase.label,
      nicheRouting,
      translation: { error: message },
      judge: null,
      durationMs: Date.now() - startedAt,
    };
  }

  // Step 3: Judge
  console.log(subSeparator("STEP 3: JUDGE"));
  let judge: JudgeOutput;
  try {
    const judgeInput: JudgeInput = {
      userBusinessDescription: testCase.businessDescription,
      audienceWhoTheySellTo: nicheRouting.audience.who_they_sell_to,
      audiencePersonaKeywords: nicheRouting.audience.audience_persona_keywords,
      reelCreatorHandle: testCase.reel.creatorHandle,
      reelOriginalNiche: testCase.reel.originalNiche,
      reelViewCount: testCase.reel.viewCount,
      reelCaption: testCase.reel.caption,
      reelTranscript: testCase.reel.transcript,
      proposedTranslation: translation,
    };
    judge = await judgeTranslation(judgeInput);
    console.log(JSON.stringify(judge, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`ERROR: ${message}`);
    return {
      testCaseId: testCase.id,
      testCaseLabel: testCase.label,
      nicheRouting,
      translation,
      judge: { error: message },
      durationMs: Date.now() - startedAt,
    };
  }

  const durationMs = Date.now() - startedAt;
  console.log(`\nCase completed in ${(durationMs / 1000).toFixed(1)}s`);

  return {
    testCaseId: testCase.id,
    testCaseLabel: testCase.label,
    nicheRouting,
    translation,
    judge,
    durationMs,
  };
}

interface AdversarialCase {
  id: string;
  label: string;
  userBusinessDescription: string;
  audienceWhoTheySellTo: string;
  audiencePersonaKeywords: string[];
  reelCreatorHandle: string;
  reelOriginalNiche: Niche;
  reelViewCount: number;
  reelCaption: string;
  reelTranscript: string;
  badTranslation: TranslationOutput;
  whyItShouldBeRejected: string;
}

const ADVERSARIAL_CASES: AdversarialCase[] = [
  {
    id: "adv-1-generic-fluff",
    label: "Generic corporate fluff translation (no specificity to user's actual business)",
    userBusinessDescription:
      "I sell commercial kitchen equipment to restaurant owners and operators in the US.",
    audienceWhoTheySellTo:
      "Independent restaurant owners and operators in the US.",
    audiencePersonaKeywords: ["restaurant owner", "food service operator"],
    reelCreatorHandle: "danmartell",
    reelOriginalNiche: "Business & Entrepreneurship",
    reelViewCount: 1200000,
    reelCaption: "5 words you should never use in sales.",
    reelTranscript:
      "5 words you should never use in sales. Number 1, try. Number 2, but. Number 3, just. Number 4, hopefully. Number 5, honestly.",
    badTranslation: {
      relevance_type: "pattern_match",
      why_it_went_viral: "It went viral because it has a list format.",
      why_we_showed_you_this:
        "This is a great opportunity for your business to grow and reach new customers in today's competitive marketplace.",
      translation_logic:
        "We took the original concept and adapted it for the restaurant industry. The list format works well across many different industries and business types.",
      draft_script: {
        hook: "5 things every business owner should know.",
        body: "Number 1, you need to optimize your operations. Number 2, you should focus on growth. Number 3, your team is your biggest asset. Number 4, never stop learning. Number 5, success requires hard work and dedication.",
        cta: "Save this for later. Follow for more business tips.",
      },
      estimated_difficulty: "easy",
      filming_note: "Just shoot it on your phone, talking to the camera.",
    },
    whyItShouldBeRejected:
      "The script uses zero restaurant-specific language. Every line could apply to any business. No reference to food cost, kitchen, menu, staff turnover, equipment, or any actual operator concern. This is the worst kind of generic content and the judge MUST catch it.",
  },
  {
    id: "adv-2-wrong-audience-attention",
    label: "Wedding photographer gets photography-tutorial translation (wrong buyer attention)",
    userBusinessDescription:
      "I am a wedding photographer in Dubai shooting luxury weddings for South Asian and Arab couples.",
    audienceWhoTheySellTo:
      "High-budget brides in Dubai planning luxury weddings.",
    audiencePersonaKeywords: ["luxury bride", "Dubai wedding"],
    reelCreatorHandle: "photographytips",
    reelOriginalNiche: "Photography & Videography",
    reelViewCount: 420000,
    reelCaption: "3 camera settings every photographer should master.",
    reelTranscript:
      "3 camera settings every photographer should master. Number 1, aperture priority mode lets you control depth of field. Number 2, back button focus separates focus from shutter. Number 3, custom white balance for skin tones.",
    badTranslation: {
      relevance_type: "direct_match",
      why_it_went_viral: "Photographers love technical tutorials.",
      why_we_showed_you_this:
        "This is a direct match for your photography business.",
      translation_logic:
        "You are a photographer, so we kept the photography focus and added wedding-specific examples.",
      draft_script: {
        hook: "3 camera settings every wedding photographer should master.",
        body: "Number 1, aperture priority for romantic depth of field on the bride. Number 2, back button focus for fast ceremony moments. Number 3, custom white balance for warm skin tones at the reception.",
        cta: "Save this and share with other wedding photographers.",
      },
      estimated_difficulty: "easy",
      filming_note:
        "Show your camera while explaining each setting.",
    },
    whyItShouldBeRejected:
      "The buyer is a BRIDE researching photographers, not a photographer looking for tutorials. This script targets other photographers (competitors), not the user's actual buyer. This is a fundamental audience-attention mismatch that the judge MUST catch. Even though the script is well-written for photographers, it would not generate any business for the user.",
  },
  {
    id: "adv-3-lazy-substitution",
    label: "Lazy substitution translation (just swapped words without real adaptation)",
    userBusinessDescription:
      "I built a SaaS product for dental practices that automates patient reminders.",
    audienceWhoTheySellTo:
      "Independent dental practice owners and office managers.",
    audiencePersonaKeywords: ["dentist", "practice owner"],
    reelCreatorHandle: "comedygenz",
    reelOriginalNiche: "Comedy & Memes",
    reelViewCount: 3400000,
    reelCaption: "When your toxic ex texts you on a Tuesday.",
    reelTranscript:
      "POV your toxic ex texts you on a Tuesday. You see the notification. You squint. You read it three times. You scroll up to last conversation. You screenshot. You send to the group chat.",
    badTranslation: {
      relevance_type: "direct_match",
      why_it_went_viral: "It is funny and relatable.",
      why_we_showed_you_this:
        "Comedy reels are very engaging and work for any audience.",
      translation_logic:
        "We took the original and swapped dating language for dental language.",
      draft_script: {
        hook: "POV: your toxic dentist texts you on a Tuesday.",
        body: "You see the notification. You squint. You read it three times. You scroll up to your last appointment. You screenshot. You send to the group chat. Sarah says block him. Emily says reply with a confused face. Jen says do nothing it is what he wants.",
        cta: "Tag a friend who has a toxic dentist.",
      },
      estimated_difficulty: "easy",
      filming_note: "Deadpan delivery, plain background.",
    },
    whyItShouldBeRejected:
      "This is lazy word substitution, not real translation. The format does not transfer because nobody actually has a 'toxic dentist' relationship. The script makes no sense in the user's actual industry. The judge MUST catch that this is a forced fit that will damage the user's credibility if they film it.",
  },
];

interface AdversarialResult {
  caseId: string;
  caseLabel: string;
  judge: JudgeOutput | { error: string };
  whyItShouldBeRejected: string;
  durationMs: number;
}

async function runOneAdversarialCase(
  adv: AdversarialCase,
): Promise<AdversarialResult> {
  const startedAt = Date.now();
  console.log(separator(`ADVERSARIAL TEST: ${adv.label}`));
  console.log(`Why it should be rejected: ${adv.whyItShouldBeRejected}`);
  console.log(subSeparator("Bad translation being fed to judge:"));
  console.log(JSON.stringify(adv.badTranslation, null, 2));
  console.log(subSeparator("JUDGE VERDICT"));

  try {
    const judgeInput: JudgeInput = {
      userBusinessDescription: adv.userBusinessDescription,
      audienceWhoTheySellTo: adv.audienceWhoTheySellTo,
      audiencePersonaKeywords: adv.audiencePersonaKeywords,
      reelCreatorHandle: adv.reelCreatorHandle,
      reelOriginalNiche: adv.reelOriginalNiche,
      reelViewCount: adv.reelViewCount,
      reelCaption: adv.reelCaption,
      reelTranscript: adv.reelTranscript,
      proposedTranslation: adv.badTranslation,
    };
    const judge = await judgeTranslation(judgeInput);
    console.log(JSON.stringify(judge, null, 2));
    return {
      caseId: adv.id,
      caseLabel: adv.label,
      judge,
      whyItShouldBeRejected: adv.whyItShouldBeRejected,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`ERROR: ${message}`);
    return {
      caseId: adv.id,
      caseLabel: adv.label,
      judge: { error: message },
      whyItShouldBeRejected: adv.whyItShouldBeRejected,
      durationMs: Date.now() - startedAt,
    };
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set. Run with: ANTHROPIC_API_KEY=sk-ant-... pnpm tsx scripts/eval-ai-prompts.ts");
    process.exit(1);
  }

  console.log(separator("SPYREELS AI PROMPT EVAL"));
  console.log(`Running ${TEST_CASES.length} test cases through niche-routing -> translation -> judge`);
  console.log(`Plus ${ADVERSARIAL_CASES.length} adversarial cases that feed BAD translations directly to the judge`);
  console.log(`Started at: ${new Date().toISOString()}`);

  const results: CaseResult[] = [];
  for (const testCase of TEST_CASES) {
    const result = await runOneCase(testCase);
    results.push(result);
  }

  console.log(separator("ADVERSARIAL CASES (judge calibration test)"));
  const adversarialResults: AdversarialResult[] = [];
  for (const adv of ADVERSARIAL_CASES) {
    const result = await runOneAdversarialCase(adv);
    adversarialResults.push(result);
  }

  // Save results to file
  const outputPath = resolve(__dirname, "eval-results.json");
  writeFileSync(
    outputPath,
    JSON.stringify({ results, adversarialResults }, null, 2),
    "utf-8",
  );

  console.log(separator("SUMMARY"));
  console.log("Normal test cases (full pipeline):");
  for (const result of results) {
    const judgeDecision =
      result.judge && !("error" in result.judge)
        ? result.judge.decision
        : "ERROR";
    const overallScore =
      result.judge && !("error" in result.judge)
        ? result.judge.overall_score
        : "n/a";
    const relevanceType =
      result.translation && !("error" in result.translation)
        ? result.translation.relevance_type
        : "n/a";
    console.log(
      `  ${result.testCaseId}: judge=${judgeDecision} score=${overallScore} relevance=${relevanceType} duration=${(result.durationMs / 1000).toFixed(1)}s`,
    );
  }

  console.log("\nAdversarial cases (judge calibration - bad translations fed directly to judge):");
  for (const advResult of adversarialResults) {
    const judgeDecision =
      advResult.judge && !("error" in advResult.judge)
        ? advResult.judge.decision
        : "ERROR";
    const overallScore =
      advResult.judge && !("error" in advResult.judge)
        ? advResult.judge.overall_score
        : "n/a";
    const expected = "should be REJECT_REGENERATE or REJECT_HIDE";
    const actuallyApproved =
      advResult.judge && !("error" in advResult.judge) && advResult.judge.decision === "APPROVE";
    const verdict = actuallyApproved ? "JUDGE FAILED (approved bad content)" : "judge worked";
    console.log(
      `  ${advResult.caseId}: judge=${judgeDecision} score=${overallScore} (${expected}) -> ${verdict}`,
    );
  }

  console.log(`\nFull results saved to: ${outputPath}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
