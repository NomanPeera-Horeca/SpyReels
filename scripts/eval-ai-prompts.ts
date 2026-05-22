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

interface PrecisionCase {
  id: string;
  label: string;
  businessDescription: string;
  whatToCheck: string;
  expectedPrimaryNicheHint: string;
  expectedKeywordsShouldInclude: string[];
  expectedKeywordsShouldNotInclude: string[];
  shouldAskClarifyingQuestion: boolean;
}

const PRECISION_CASES: PrecisionCase[] = [
  // ===== AMBIGUITY TESTS (should ask clarifying_question) =====
  {
    id: "precision-01-fashion-one-word",
    label: "One word: Fashion",
    businessDescription: "Fashion",
    whatToCheck: "One word input. Must ask clarifying question. Fashion is too broad (men/women, luxury/thrift, streetwear/formal).",
    expectedPrimaryNicheHint: "Fashion & Style",
    expectedKeywordsShouldInclude: [],
    expectedKeywordsShouldNotInclude: [],
    shouldAskClarifyingQuestion: true,
  },
  {
    id: "precision-02-crochet-one-word",
    label: "One word: Crochet",
    businessDescription: "My niche is crochet",
    whatToCheck: "Very short, vague. Sells what? Patterns? Finished goods? Tutorials? Should ask.",
    expectedPrimaryNicheHint: "Tutorials & How-To",
    expectedKeywordsShouldInclude: [],
    expectedKeywordsShouldNotInclude: [],
    shouldAskClarifyingQuestion: true,
  },
  {
    id: "precision-03-make-money-on-instagram",
    label: "I help people make money on Instagram (original failure case)",
    businessDescription: "I help people make money on Instagram",
    whatToCheck: "This case FAILED in run 4 with the old prompt. The new semantic ambiguity rule must catch it now. Should ask clarifying question.",
    expectedPrimaryNicheHint: "Make Money Online",
    expectedKeywordsShouldInclude: [],
    expectedKeywordsShouldNotInclude: [],
    shouldAskClarifyingQuestion: true,
  },
  {
    id: "precision-04-healing-and-growth-theme-page",
    label: "Theme page, healing and growth",
    businessDescription: "Theme page, healing and growth",
    whatToCheck: "What kind of healing? Trauma, physical, spiritual? Should ask.",
    expectedPrimaryNicheHint: "Mental Health & Mindfulness",
    expectedKeywordsShouldInclude: [],
    expectedKeywordsShouldNotInclude: [],
    shouldAskClarifyingQuestion: true,
  },
  {
    id: "precision-05-just-quitting-job-starting-company",
    label: "Quitting my job and starting a company",
    businessDescription: "Quitting my job and starting a company",
    whatToCheck: "Topic of one reel, not a business niche. Should ask what the business actually is.",
    expectedPrimaryNicheHint: "Business & Entrepreneurship",
    expectedKeywordsShouldInclude: [],
    expectedKeywordsShouldNotInclude: [],
    shouldAskClarifyingQuestion: true,
  },

  // ===== SPECIFIC NICHES (should NOT ask clarifying, must produce sharp keywords) =====
  {
    id: "precision-06-lyrical-hip-hop-artist",
    label: "Lyrical soulful hip hop artist",
    businessDescription: "I am a lyrical soulful hip hop artist. I make music focused on bars and storytelling, not commercial rap. I want to grow on Instagram to get more streams on Spotify and Apple Music.",
    whatToCheck: "Specific enough. Should route to Music & Musicians with hip hop / lyrical keywords. Audience is hip hop fans who care about bars, not casual listeners.",
    expectedPrimaryNicheHint: "Music & Musicians",
    expectedKeywordsShouldInclude: ["hip hop", "lyrical", "bars"],
    expectedKeywordsShouldNotInclude: ["pop music", "edm"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-07-elden-ring-twitch-clips",
    label: "Twitch clips and Elden Ring satire scripts",
    businessDescription: "I post Elden Ring twitch clips and satire scripts about the game. I am building a fresh account around gaming content for Souls-game players who enjoy both highlight clips and comedy.",
    whatToCheck: "Gaming niche. Should pick up Elden Ring, Souls game, gaming. Audience is gamers, specifically Souls-game players.",
    expectedPrimaryNicheHint: "Comedy & Memes",
    expectedKeywordsShouldInclude: ["gamer", "souls", "elden ring"],
    expectedKeywordsShouldNotInclude: ["esports professional", "mobile gamer"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-08-prank-content",
    label: "Pranking strangers with fart toy or being socially awkward with strangers",
    businessDescription: "I do prank content. I prank strangers in public with a fart toy and also do videos where I pretend to be socially awkward with strangers to film their reactions.",
    whatToCheck: "Comedy/prank niche. Audience is comedy/prank viewers, not the strangers themselves.",
    expectedPrimaryNicheHint: "Comedy & Memes",
    expectedKeywordsShouldInclude: ["prank", "comedy", "reaction"],
    expectedKeywordsShouldNotInclude: ["pranked stranger"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-09-freight-railroad-photography",
    label: "Freight and railroad photography and video",
    businessDescription: "I do freight train and railroad photography and video. I sell wall calendars and prints featuring my photography through an Etsy shop. My audience is train enthusiasts, railfans, and railroad workers.",
    whatToCheck: "Ultra-narrow niche (railfans). Audience is railfans, not photographers. Should NOT confuse user with buyer.",
    expectedPrimaryNicheHint: "Photography & Videography",
    expectedKeywordsShouldInclude: ["railfan", "train enthusiast"],
    expectedKeywordsShouldNotInclude: ["photographer career", "photography student"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-10-animal-artist-pet-portraits",
    label: "Animal artist painting realistic pet portraits",
    businessDescription: "I am an animal artist who paints realistic pet portraits on commission. My style is not hyper-realistic. I sell commissioned pet portraits to pet owners who want a painting of their dog or cat.",
    whatToCheck: "Audience is PET OWNERS commissioning art, NOT other artists. Critical buyer identification test.",
    expectedPrimaryNicheHint: "Pets & Animals",
    expectedKeywordsShouldInclude: ["pet owner", "dog owner", "cat owner"],
    expectedKeywordsShouldNotInclude: ["artist career", "art student", "fine art"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-11-psychology-solopreneur",
    label: "Psychology content solopreneur",
    businessDescription: "I create psychology content as a solopreneur. I post about attachment styles, trauma responses, people pleasing patterns, and how childhood family dynamics show up in adult relationships.",
    whatToCheck: "Mental Health & Mindfulness primary. Audience is people interested in self-understanding and psychology.",
    expectedPrimaryNicheHint: "Mental Health & Mindfulness",
    expectedKeywordsShouldInclude: ["self-awareness", "psychology", "trauma"],
    expectedKeywordsShouldNotInclude: ["licensed therapist career"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-12-fencing-landscaping-local",
    label: "Fencing and landscaping company in small county",
    businessDescription: "I run a fencing and landscaping company in a small county. My customers are local homeowners and small businesses in my area who need fencing installed or landscaping done. I want to grow beyond my immediate area.",
    whatToCheck: "Local services B2C. Audience is HOMEOWNERS, not other contractors. Buyer identification test.",
    expectedPrimaryNicheHint: "Home & Interior Design",
    expectedKeywordsShouldInclude: ["homeowner", "local", "landscaping"],
    expectedKeywordsShouldNotInclude: ["fencing contractor", "landscaping business owner"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-13-wildlife-photography-cellphone",
    label: "Wildlife photography on cellphone",
    businessDescription: "I do wildlife photography on my cellphone. It is a niche within a niche. I show people that they do not need expensive DSLR cameras to take great wildlife photos.",
    whatToCheck: "Audience is amateur photographers / phone users curious about wildlife, NOT pro photographers.",
    expectedPrimaryNicheHint: "Photography & Videography",
    expectedKeywordsShouldInclude: ["iphone photography", "phone photography", "amateur"],
    expectedKeywordsShouldNotInclude: ["professional photographer", "dslr"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-14-travel-neurodivergent-multigen",
    label: "Travel for neurodivergent and multi-generational families",
    businessDescription: "I create travel content for neurodivergent travelers and multi-generational families. I cover how to fly with ADHD, traveling with elderly parents and young kids together, and reducing sensory overload on trips.",
    whatToCheck: "Specific travel sub-niche. Audience is parents with ADHD/neurodivergent kids or grown adults caring for elderly parents.",
    expectedPrimaryNicheHint: "Travel",
    expectedKeywordsShouldInclude: ["neurodivergent", "multi-generational", "adhd"],
    expectedKeywordsShouldNotInclude: ["budget backpacker", "solo female traveler"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-15-homesteading-self-build",
    label: "Homesteading and self-building our home",
    businessDescription: "We are documenting our journey homesteading and self-building our home. We post about land clearing, building structures, growing food, raising animals, and living off grid.",
    whatToCheck: "Audience is people interested in homesteading lifestyle, off-grid living, sustainable life. NOT other construction professionals.",
    expectedPrimaryNicheHint: "Home & Interior Design",
    expectedKeywordsShouldInclude: ["homesteading", "off-grid", "self-build"],
    expectedKeywordsShouldNotInclude: ["general contractor", "construction career"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-16-waist-trainer-transformation-system",
    label: "Waist trainer with diet and workout plan",
    businessDescription: "I sell a transformation system that is a waist trainer paired with a diet and workout plan. My customers are women who want to lose weight and reshape their bodies. They follow the diet and workout while wearing the waist trainer.",
    whatToCheck: "Audience is women seeking weight loss / body transformation. Product is B2C physical.",
    expectedPrimaryNicheHint: "Health & Fitness",
    expectedKeywordsShouldInclude: ["weight loss", "body transformation", "women"],
    expectedKeywordsShouldNotInclude: ["bodybuilder", "athlete performance"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-17-stationery-budget-planner",
    label: "Stationery design and low-budget planner decoration",
    businessDescription: "I design stationery and teach low-budget ways to make planners look good. My audience is people who use paper planners and want their planner to look aesthetic without spending a lot of money on washi tape and stickers.",
    whatToCheck: "Niche audience. People interested in planner aesthetic + budget conscious. NOT professional designers.",
    expectedPrimaryNicheHint: "Tutorials & How-To",
    expectedKeywordsShouldInclude: ["planner", "stationery", "budget"],
    expectedKeywordsShouldNotInclude: ["graphic designer career"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-18-tattoo-artist-clients",
    label: "Tattoo artist building client base",
    businessDescription: "I am a tattoo artist. I post my work and process videos on Instagram to attract new clients. I do mostly fine line and illustrative style tattoos.",
    whatToCheck: "Audience is potential CLIENTS looking for a tattoo artist, NOT other tattoo artists.",
    expectedPrimaryNicheHint: "Beauty & Skincare",
    expectedKeywordsShouldInclude: ["fine line", "tattoo", "client"],
    expectedKeywordsShouldNotInclude: ["tattoo artist career", "tattoo apprentice"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-19-fashion-beauty-mom-focus",
    label: "Fashion and beauty with motherhood subfocus",
    businessDescription: "I create fashion and beauty content with a subfocus on motherhood. I share the products and outfits I swear by as a busy mom. My audience is moms who still want to feel put-together but have limited time and energy.",
    whatToCheck: "Sub-niche: mom fashion/beauty. Audience is moms specifically, not general fashion audience.",
    expectedPrimaryNicheHint: "Fashion & Style",
    expectedKeywordsShouldInclude: ["mom", "busy mom"],
    expectedKeywordsShouldNotInclude: ["luxury fashion", "runway"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-20-piano-cinematic",
    label: "Piano content, cinematic and movie themes",
    businessDescription: "I make piano content, mostly emotional and cinematic pieces, movie themes, improvisations, and some classical. I also mix in guitar, harmonica, and flute occasionally.",
    whatToCheck: "Music niche, specific to cinematic/instrumental. Audience is film music fans, instrument enthusiasts.",
    expectedPrimaryNicheHint: "Music & Musicians",
    expectedKeywordsShouldInclude: ["piano", "cinematic", "film music"],
    expectedKeywordsShouldNotInclude: ["pop singer", "rapper"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-21-boutique-soft-feminine-fashion",
    label: "Soft feminine boutique fashion",
    businessDescription: "I just launched a boutique selling soft feminine fashion with a neutral, effortless, and elevated everyday style. My audience is women who want elevated basics for everyday wear without trendy fast fashion.",
    whatToCheck: "B2C ecommerce fashion. Audience is women seeking elevated minimalist style.",
    expectedPrimaryNicheHint: "Fashion & Style",
    expectedKeywordsShouldInclude: ["elevated", "minimalist", "everyday style"],
    expectedKeywordsShouldNotInclude: ["streetwear", "fast fashion"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-22-nutrition-postpartum-weightloss",
    label: "Nutrition and postpartum weight loss",
    businessDescription: "I am a nutritionist focused on postpartum weight loss. I work with moms 3 to 12 months postpartum who want to lose weight while still breastfeeding and managing a baby.",
    whatToCheck: "Specific sub-niche: postpartum nutrition. Audience is postpartum moms, narrow window.",
    expectedPrimaryNicheHint: "Health & Fitness",
    expectedKeywordsShouldInclude: ["postpartum", "breastfeeding", "new mom"],
    expectedKeywordsShouldNotInclude: ["bodybuilder", "general fitness"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-23-financial-education-german-moms",
    label: "Financial education for kids and German moms (in German)",
    businessDescription: "I am a children's book author teaching financial education for kids and part-time working moms in Germany. I publish in German. My audience is German-speaking moms who want to teach their kids about money.",
    whatToCheck: "Geography + audience specificity matter. Moms in Germany, German language, financial education for kids.",
    expectedPrimaryNicheHint: "Personal Finance",
    expectedKeywordsShouldInclude: ["mom", "kids", "german"],
    expectedKeywordsShouldNotInclude: ["wealthy investor", "stock trader"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-24-b2b-makeup-brushes-china",
    label: "B2B makeup brush manufacturing in China",
    businessDescription: "I run a B2B makeup brush manufacturing company in China. We sell to beauty brands and retailers who want to private label or wholesale our brushes. Buyers are usually beauty brand owners or store buyers looking to source product.",
    whatToCheck: "B2B critical test. Audience is BEAUTY BRAND OWNERS / BUYERS, not end consumers. Should NOT be Beauty & Skincare consumer audience.",
    expectedPrimaryNicheHint: "Business & Entrepreneurship",
    expectedKeywordsShouldInclude: ["beauty brand owner", "wholesale", "private label"],
    expectedKeywordsShouldNotInclude: ["makeup user", "beauty enthusiast"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-25-poker-content-creator",
    label: "Poker player content",
    businessDescription: "I play poker for a living and create poker content. I share hand analyses, big pots, and lessons learned from playing cash games and tournaments. My audience is recreational and serious poker players.",
    whatToCheck: "Specific niche: poker. Audience is poker players, not general gambling.",
    expectedPrimaryNicheHint: "Sports & Athletes",
    expectedKeywordsShouldInclude: ["poker", "cash game", "tournament"],
    expectedKeywordsShouldNotInclude: ["sports betting", "casino"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-26-travel-packing-gear",
    label: "Travel packing and gear",
    businessDescription: "I create content about travel packing and gear. I review luggage, packing cubes, travel tech, and share efficient packing strategies. My audience is frequent travelers and people who want to travel carry-on only.",
    whatToCheck: "Travel sub-niche: packing/gear. Audience is frequent travelers, minimalists, carry-on enthusiasts.",
    expectedPrimaryNicheHint: "Travel",
    expectedKeywordsShouldInclude: ["packing", "carry-on", "travel gear"],
    expectedKeywordsShouldNotInclude: ["luxury hotel", "all inclusive resort"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-27-makeup-tutorials-drugstore",
    label: "Drugstore makeup tutorials and reviews",
    businessDescription: "I create makeup tutorials and product reviews focused on drugstore makeup that performs as well as luxury brands. My audience is women who want professional-looking makeup without paying high-end prices.",
    whatToCheck: "Niche: drugstore makeup. Audience is budget-conscious makeup users.",
    expectedPrimaryNicheHint: "Beauty & Skincare",
    expectedKeywordsShouldInclude: ["drugstore", "budget makeup", "dupe"],
    expectedKeywordsShouldNotInclude: ["luxury beauty"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-28-roman-republic-musical",
    label: "Musical about the Roman Republic",
    businessDescription: "I am developing a musical about the Roman Republic. I want to build an audience while writing it. The overlap is between Roman history enthusiasts and musical theatre lovers.",
    whatToCheck: "Cross-niche audience: history + musical theatre. Should reflect both, not just one.",
    expectedPrimaryNicheHint: "Music & Musicians",
    expectedKeywordsShouldInclude: ["history", "musical theatre", "roman"],
    expectedKeywordsShouldNotInclude: ["pop concert"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-29-crochet-pattern-seller",
    label: "Crochet pattern seller (clarified version)",
    businessDescription: "I design crochet patterns and sell them as PDF downloads. My patterns are mostly amigurumi animals and beginner-friendly. My customers are crocheters who want unique designs to make themselves.",
    whatToCheck: "Clarified version of the one-word 'Crochet' case. Should now confidently route. Audience is crocheters making things for themselves.",
    expectedPrimaryNicheHint: "Tutorials & How-To",
    expectedKeywordsShouldInclude: ["crochet", "amigurumi", "pattern"],
    expectedKeywordsShouldNotInclude: ["fashion designer"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-30-restaurant-owner-personal-brand",
    label: "Restaurant owner building personal brand",
    businessDescription: "I own a restaurant and I am trying to grow my Instagram to build a personal brand. I want to share what it is like running a restaurant, lessons learned, and behind the scenes content for other restaurant owners and aspiring ones.",
    whatToCheck: "Audience is OTHER restaurant owners and aspiring restaurant owners, not diners. B2B-ish personal brand.",
    expectedPrimaryNicheHint: "Business & Entrepreneurship",
    expectedKeywordsShouldInclude: ["restaurant owner", "restaurateur", "behind the scenes"],
    expectedKeywordsShouldNotInclude: ["diner", "food blogger"],
    shouldAskClarifyingQuestion: false,
  },

  // ===== KEEPING ORIGINAL BUYER-IDENTIFICATION CASES =====
  {
    id: "precision-31-daycare-houston",
    label: "Daycare in Houston (buyer is parents, not operators)",
    businessDescription: "I run a daycare in Houston. We serve children ages 1 to 5 and we have 40 spots across two locations. Most of our enrollment comes from referrals and Google searches.",
    whatToCheck: "Critical buyer test. Should target PARENTS, not other daycare operators.",
    expectedPrimaryNicheHint: "Parenting & Family",
    expectedKeywordsShouldInclude: ["parent", "mom", "houston"],
    expectedKeywordsShouldNotInclude: ["daycare operator", "childcare business"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-32-hr-software-small-business",
    label: "HR software for small businesses 5-25 employees",
    businessDescription: "I sell HR software to small business owners with 5 to 25 employees. My customers handle hiring, payroll, onboarding, and time tracking themselves and want to stop using spreadsheets.",
    whatToCheck: "B2B. Buyer is small business owner, not HR professional.",
    expectedPrimaryNicheHint: "Business & Entrepreneurship",
    expectedKeywordsShouldInclude: ["small business owner", "5-25 employees"],
    expectedKeywordsShouldNotInclude: ["HR professional", "HR manager"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-33-bjj-mouthguards",
    label: "Custom mouthguards for jiu jitsu competitors",
    businessDescription: "I sell custom-fitted mouthguards for jiu jitsu competitors. My customers are mostly no-gi BJJ practitioners competing at brown and black belt level who want better fit and protection than store-bought options.",
    whatToCheck: "Ultra-narrow. Should produce BJJ-specific keywords.",
    expectedPrimaryNicheHint: "Sports & Athletes",
    expectedKeywordsShouldInclude: ["bjj", "jiu jitsu", "grappler"],
    expectedKeywordsShouldNotInclude: ["general fitness"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-34-women-over-40-supplements",
    label: "Pre-workout supplements for women over 40 with hormonal goals",
    businessDescription: "I sell pre-workout supplements designed for women over 40 with hormonal weight loss goals. My customers are perimenopausal and menopausal women who lift weights and want to manage weight gain caused by hormonal changes.",
    whatToCheck: "Sharp audience required. Should include menopause/perimenopause keywords.",
    expectedPrimaryNicheHint: "Health & Fitness",
    expectedKeywordsShouldInclude: ["women over 40", "perimenopause", "menopause"],
    expectedKeywordsShouldNotInclude: ["bodybuilder", "athlete performance"],
    shouldAskClarifyingQuestion: false,
  },
  {
    id: "precision-35-doctor-finance-california",
    label: "Financial advisor for California doctors",
    businessDescription: "I am a financial advisor helping doctors in California with student loan refinancing and tax strategy. My clients are residents, fellows, and attending physicians who have 200k to 500k in medical school debt.",
    whatToCheck: "Geography + buyer specificity. Should be physician finance specific.",
    expectedPrimaryNicheHint: "Personal Finance",
    expectedKeywordsShouldInclude: ["physician", "doctor", "medical school debt"],
    expectedKeywordsShouldNotInclude: ["budgeting basics"],
    shouldAskClarifyingQuestion: false,
  },
];

interface PrecisionResult {
  caseId: string;
  caseLabel: string;
  output: NicheRoutingOutput | { error: string };
  durationMs: number;
  manualCheckHints: {
    expectedPrimaryNicheHint: string;
    expectedKeywordsShouldInclude: string[];
    expectedKeywordsShouldNotInclude: string[];
    shouldAskClarifyingQuestion: boolean;
  };
}

async function runOnePrecisionCase(
  precisionCase: PrecisionCase,
): Promise<PrecisionResult> {
  const startedAt = Date.now();
  console.log(separator(`PRECISION TEST: ${precisionCase.label}`));
  console.log(`Business description:\n${precisionCase.businessDescription}\n`);
  console.log(`What to check: ${precisionCase.whatToCheck}\n`);
  console.log(`Expected primary niche hint: ${precisionCase.expectedPrimaryNicheHint}`);
  console.log(`Keywords SHOULD include any of: ${precisionCase.expectedKeywordsShouldInclude.join(", ") || "n/a"}`);
  console.log(`Keywords SHOULD NOT include: ${precisionCase.expectedKeywordsShouldNotInclude.join(", ") || "n/a"}`);
  console.log(`Should ask clarifying question: ${precisionCase.shouldAskClarifyingQuestion}`);
  console.log(subSeparator("NICHE ROUTING OUTPUT"));

  try {
    const output = await routeNiche({
      businessDescription: precisionCase.businessDescription,
    });
    console.log(JSON.stringify(output, null, 2));
    return {
      caseId: precisionCase.id,
      caseLabel: precisionCase.label,
      output,
      durationMs: Date.now() - startedAt,
      manualCheckHints: {
        expectedPrimaryNicheHint: precisionCase.expectedPrimaryNicheHint,
        expectedKeywordsShouldInclude: precisionCase.expectedKeywordsShouldInclude,
        expectedKeywordsShouldNotInclude: precisionCase.expectedKeywordsShouldNotInclude,
        shouldAskClarifyingQuestion: precisionCase.shouldAskClarifyingQuestion,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`ERROR: ${message}`);
    return {
      caseId: precisionCase.id,
      caseLabel: precisionCase.label,
      output: { error: message },
      durationMs: Date.now() - startedAt,
      manualCheckHints: {
        expectedPrimaryNicheHint: precisionCase.expectedPrimaryNicheHint,
        expectedKeywordsShouldInclude: precisionCase.expectedKeywordsShouldInclude,
        expectedKeywordsShouldNotInclude: precisionCase.expectedKeywordsShouldNotInclude,
        shouldAskClarifyingQuestion: precisionCase.shouldAskClarifyingQuestion,
      },
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

  console.log(separator("PRECISION CASES (niche routing edge cases)"));
  const precisionResults: PrecisionResult[] = [];
  for (const precisionCase of PRECISION_CASES) {
    const result = await runOnePrecisionCase(precisionCase);
    precisionResults.push(result);
  }

  // Save results to file
  const outputPath = resolve(__dirname, "eval-results.json");
  writeFileSync(
    outputPath,
    JSON.stringify(
      { results, adversarialResults, precisionResults },
      null,
      2,
    ),
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

  console.log("\nPrecision niche routing cases (manual review needed):");
  for (const pResult of precisionResults) {
    const hasError = "error" in pResult.output;
    if (hasError) {
      console.log(`  ${pResult.caseId}: ERROR`);
      continue;
    }
    const output = pResult.output as NicheRoutingOutput;
    const keywords = output.audience.audience_persona_keywords.join(", ");
    const askedClarifying = output.clarifying_question !== null;
    console.log(
      `  ${pResult.caseId}: primary=${output.primary_niche} confidence=${output.confidence} clarifying=${askedClarifying}`,
    );
    console.log(`    keywords: ${keywords}`);
  }

  console.log(`\nFull results saved to: ${outputPath}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
