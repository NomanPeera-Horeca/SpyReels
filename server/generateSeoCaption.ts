import { invokeLLM } from "./_core/llm";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "./utils/sanitizeAiOutput";

export const CAPTION_STYLES = [
  "storytelling",
  "question",
  "cta",
  "educational",
  "curiosity",
  "bold",
  "relatable",
] as const;

export const CAPTION_LENGTHS = ["auto", "short", "medium", "long"] as const;

export type CaptionStyle = (typeof CAPTION_STYLES)[number];
export type CaptionLength = (typeof CAPTION_LENGTHS)[number];

export type SeoCaptionResult = {
  caption: string;
  hashtags: string[];
  primaryKeyword: string;
  hookType: string;
  style: CaptionStyle;
};

const STYLE_GUIDES: Record<CaptionStyle, string> = {
  storytelling:
    "Write as a personal narrative. Start with a relatable moment or struggle, build tension, then deliver a lesson. Use first person. Make the reader feel like they're hearing from a friend.",
  question:
    "Open with a thought-provoking question that stops the scroll. Follow with 2-3 lines that challenge assumptions. End with another question or a bold statement that invites comments.",
  cta: "Lead with a bold command or urgent statement. Deliver one clear benefit. End with a specific, actionable CTA using the A+B formula: Specific Interaction (A) + Benefit of Interacting (B). Examples: 'Save this post (A) and level-up your captions (B)', 'Comment your question (A) and I will answer them for you (B)'.",
  educational:
    "Start with a hook that promises value. Deliver 2-3 concise tips or insights that ADD VALUE beyond what the video shows. End with a CTA using the A+B formula.",
  curiosity:
    "Tease without revealing everything. Use phrases like 'This changed everything', 'I wish I knew this sooner', 'The real reason why...'. Create an open loop that makes them watch the full video.",
  bold: "Make a controversial or contrarian statement that challenges popular belief. Back it up with one strong argument. End with 'Agree or disagree?' or similar debate-starter.",
  relatable:
    "Use humor, sarcasm, or 'it me' energy. Reference common struggles or wins in the niche. Keep it short, punchy, and shareable. Think meme-caption energy.",
};

/** Same SEO caption generator used by Script Editor (scripts.generateCaption). */
export async function generateSeoInstagramCaption(args: {
  content: string;
  style?: CaptionStyle;
  captionLength?: CaptionLength;
  niche?: string;
  brandHashtag?: string;
  targetAudience?: string;
}): Promise<SeoCaptionResult> {
  const style: CaptionStyle = args.style ?? "educational";
  const captionLength: CaptionLength = args.captionLength ?? "auto";
  const scriptWordCount = args.content.trim().split(/\s+/).filter(Boolean).length;

  let lengthInstruction: string;
  if (captionLength === "auto") {
    if (scriptWordCount > 200) {
      lengthInstruction =
        "SHORT caption (5-7 lines / 40-70 words). The video is long, so keep the caption concise and punchy.";
    } else if (scriptWordCount > 100) {
      lengthInstruction =
        "MEDIUM caption (8-12 lines / 70-120 words). Balanced length for a medium-length video.";
    } else {
      lengthInstruction =
        "LONG caption (13+ lines / 120-200 words). The video is short, so the caption should provide substantial extra value and context.";
    }
  } else if (captionLength === "short") {
    lengthInstruction =
      "SHORT caption (5-7 lines / 40-70 words). Keep it tight and punchy. Every word must earn its place.";
  } else if (captionLength === "medium") {
    lengthInstruction =
      "MEDIUM caption (8-12 lines / 70-120 words). Balanced, enough value without overwhelming.";
  } else {
    lengthInstruction =
      "LONG caption (13+ lines / 120-200 words). Go deep: provide extra value, context, and keywords for SEO.";
  }

  const nicheContext = args.niche ? `The creator's niche is: ${args.niche}.` : "";
  const audienceContext = args.targetAudience
    ? `Target audience: ${args.targetAudience}.`
    : "";
  const brandTag = args.brandHashtag
    ? `The brand hashtag to include is: ${args.brandHashtag}.`
    : "Do NOT include a brand hashtag.";

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(`You are an expert Instagram caption writer and SEO strategist specializing in Reels. You follow the proven 6-step caption framework used by top creators.

=== THE 3-PART CAPTION STRUCTURE ===
Every caption MUST have exactly 3 parts:

1. THE HOOK (first line, before "...more")
   - MUST be exactly 7-10 words, no more, no less
   - This is the only line visible before users tap "more"
   - Must contain the primary SEO keyword
   - Use one of these proven hook templates:
     * "X [niche] tips I wish I knew earlier"
     * "Steal this blueprint for [dream outcome]"
     * "Stop doing these X mistakes, instead..."
     * "X weird tips most people don't know about [niche]"
     * "Here's the reality about [niche] most people don't know about"
     * "This [thing] changed everything for my [result]"
     * "Nobody talks about this [niche] secret"
     * Or create a similarly compelling 7-10 word hook

2. THE BODY (5-15 lines depending on length setting)
   - Provide EXTRA VALUE beyond what the video shows. Do not just summarize the video
   - Give context as to WHY people should care about this post
   - Use proper formatting: emojis + line breaks for readability
   - AVOID long paragraphs, especially at the beginning
   - Repeat the primary keyword 2-3 times naturally throughout
   - Include secondary keywords for SEO
   - Each line should be short and scannable

3. THE CTA (last 1-2 lines)
   - Use the A+B formula: Specific Interaction (A) + Benefit of Interacting (B)
   - Examples:
     * "Save this post (A) and level-up your captions (B)"
     * "Comment your question (A) and I'll answer them for you (B)"
     * "Share this with a creator (A) who needs to hear this (B)"
   - Add a blank line/space AFTER the CTA and BEFORE the hashtags

=== FORMATTING RULES ===
- Use emojis sparingly but strategically (1-3 per caption, not every line)
- Use line breaks between every 1-2 sentences
- NO long paragraphs, especially at the start
- Add blank line between hook and body, and between body and CTA
- The caption must provide ADDITIONAL VALUE to the audience and the algorithm, not just repeat what's in the video

=== CAPTION LENGTH ===
${lengthInstruction}

=== CAPTION STYLE ===
${STYLE_GUIDES[style]}

=== HASHTAG FRAMEWORK: 3x3 STRATEGY (exactly 5) ===
Use the proven 3x3 hashtag strategy adapted for Instagram's 5-hashtag limit:

1-2. VIDEO TOPIC (2 hashtags): What is this content about?
   - Specific to the video's subject matter (not generic like #marketing)
   - Example for a fitness video: #weightlifting, #homeworkout

3-4. TARGET AUDIENCE (2 hashtags): Who should see this?
   - Describe the ideal viewer's identity or situation
   - Example: #busydad, #businessowner

5. DREAM RESULT (1 hashtag): What outcome does the viewer want?
   - The transformation or goal the audience is chasing
   - Example: #losefat, #growoninstagram, #makemoneyonline
   ${args.brandHashtag ? "- Replace one Video Topic hashtag with the brand hashtag: " + args.brandHashtag : ""}

${nicheContext}
${audienceContext}
${brandTag}

RESPOND IN THIS EXACT JSON FORMAT:
{
  "caption": "The full caption text with line breaks as \\n",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "primaryKeyword": "the main keyword used for SEO",
  "hookType": "the type of hook used"
}

Do NOT include # in the hashtags array, just the word/phrase.
Do NOT put hashtags inside the caption text, they go separately.
The hook MUST be 7-10 words. Count them.`),
      },
      {
        role: "user",
        content: `Generate an Instagram caption for this Reel script (${scriptWordCount} words):\n\n${args.content}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "caption_result",
        strict: true,
        schema: {
          type: "object",
          properties: {
            caption: { type: "string", description: "The full caption text" },
            hashtags: {
              type: "array",
              items: { type: "string" },
              description: "Exactly 5 hashtags without # prefix",
            },
            primaryKeyword: { type: "string", description: "The main SEO keyword" },
            hookType: { type: "string", description: "The hook type used" },
          },
          required: ["caption", "hashtags", "primaryKeyword", "hookType"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = ((response.choices[0]?.message?.content as string) || "")
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  if (!raw) {
    throw new Error("Empty caption response");
  }

  const parsed = sanitizeAiOutputDeep(JSON.parse(raw)) as {
    caption: string;
    hashtags: string[];
    primaryKeyword: string;
    hookType: string;
  };

  return {
    caption: String(parsed.caption ?? "").trim(),
    hashtags: (parsed.hashtags ?? []).slice(0, 5).map((h) => String(h).replace(/^#/, "").trim()).filter(Boolean),
    primaryKeyword: String(parsed.primaryKeyword ?? "").trim(),
    hookType: String(parsed.hookType ?? "").trim(),
    style,
  };
}
