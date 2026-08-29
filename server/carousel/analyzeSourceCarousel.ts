import {
  CAROUSEL_LAYOUT_IDS,
  type CarouselLayoutId,
} from "@shared/carouselTemplates";
import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";

export type SourceCarouselSlideAnalysis = {
  closestLayoutId: CarouselLayoutId;
  extractedText: Record<string, string>;
  imageStyleDescription: string;
  hasPhoto: boolean;
};

export type SourceCarouselAnalysis = {
  slides: SourceCarouselSlideAnalysis[];
  /**
   * Resolved stills in swipe order (prefer base64 data URLs after download).
   * Reuse for vision-grounded image gen so we do not re-fetch CDN URLs.
   */
  resolvedImageUrls: string[];
};

const MAX_SLIDES = 20;

const EXTRACTED_TEXT_KEYS = [
  "kicker",
  "headline",
  "subhead",
  "body",
  "cta_label",
  "callout",
  "excuse_tl",
  "excuse_tr",
  "excuse_bl",
  "excuse_br",
  "excuse",
  "reframe",
  "average",
  "not_line",
  "quote",
] as const;

const LAYOUT_SLOT_IDS: Record<CarouselLayoutId, readonly string[]> = {
  hook_bold_center: ["kicker", "headline", "subhead"],
  list_item_numbered: ["kicker", "headline", "body"],
  cta_bold_center: ["headline", "subhead", "cta_label"],
  hook_photo_top: ["kicker", "headline", "subhead"],
  photo_caption_bubble: ["headline"],
  notebook_cover: ["headline", "subhead", "kicker"],
  notebook_list_item: ["kicker", "headline", "body"],
  list_item_warm_numbered: ["kicker", "headline", "body", "callout"],
  quote_tweet_card: ["headline"],
  excuse_grid_4: ["excuse_tl", "excuse_tr", "excuse_bl", "excuse_br"],
  excuse_split_stack: ["excuse", "reframe"],
  stat_split_stack: ["average", "not_line"],
  photo_quote_bubbles: ["quote", "cta_label"],
};

const LAYOUT_PROMPT_LINES: Record<CarouselLayoutId, string> = {
  hook_bold_center:
    "text-only cover: small kicker, large centered headline, supporting subhead",
  list_item_numbered:
    "numbered list beat: kicker is the number (01), headline is the item title, body explains it",
  cta_bold_center:
    "closing CTA: headline ask, supporting subhead, short cta_label chip",
  hook_photo_top:
    "photo on the top half, kicker/headline/subhead stacked below",
  photo_caption_bubble:
    "full-bleed photo with one caption (headline) in a rounded bubble",
  notebook_cover:
    "grid-paper cover with a photo plus headline, swipe subhead, and arrow kicker",
  notebook_list_item:
    "grid-paper numbered tip: kicker number, highlighter headline, body tip",
  list_item_warm_numbered:
    "warm kraft numbered advice: kicker, headline, body, optional callout checklist",
  quote_tweet_card:
    "tweet-style quote card; headline is the quote; optional avatar photo",
  excuse_grid_4:
    "2x2 photo grid with four short excuse labels (excuse_tl, excuse_tr, excuse_bl, excuse_br)",
  excuse_split_stack:
    "split stack: top half excuse (often grayscale), bottom half reframe",
  stat_split_stack:
    "split stack: top average stat line, bottom punchy not_line (e.g. Not 27)",
  photo_quote_bubbles:
    "full-bleed photo with a quote bubble plus a short cta_label bubble",
};

const SLOT_ALIASES: Record<string, string> = {
  number: "kicker",
  caption: "headline",
  title: "headline",
  heading: "headline",
  body_callout: "callout",
  cta: "cta_label",
  swipe: "subhead",
  swipe_line: "subhead",
};

const EXTRACTED_TEXT_SCHEMA_PROPERTIES = Object.fromEntries(
  EXTRACTED_TEXT_KEYS.map((key) => [key, { type: "string" }])
);

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          closestLayoutId: {
            type: "string",
            description: `Best matching layout id from: ${CAROUSEL_LAYOUT_IDS.join(", ")}`,
          },
          extractedText: {
            type: "object",
            properties: EXTRACTED_TEXT_SCHEMA_PROPERTIES,
            required: [...EXTRACTED_TEXT_KEYS],
            additionalProperties: false,
          },
          imageStyleDescription: {
            type: "string",
            description:
              "Short stock-photo / image-gen query: subject, setting, lighting, mood. Do not copy logos, faces, or brand marks.",
          },
          hasPhoto: { type: "boolean" },
        },
        required: [
          "closestLayoutId",
          "extractedText",
          "imageStyleDescription",
          "hasPhoto",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["slides"],
  additionalProperties: false,
};

const LAYOUT_CATALOG = (CAROUSEL_LAYOUT_IDS as readonly CarouselLayoutId[])
  .map((id) => {
    const slots = LAYOUT_SLOT_IDS[id].join(", ");
    return `- ${id}: ${LAYOUT_PROMPT_LINES[id]}. Slots: ${slots}`;
  })
  .join("\n");

function isCarouselLayoutId(value: string): value is CarouselLayoutId {
  return (CAROUSEL_LAYOUT_IDS as readonly string[]).includes(value);
}

function fallbackLayoutId(index: number, total: number): CarouselLayoutId {
  if (index === 0) return "hook_bold_center";
  if (total > 1 && index === total - 1) return "cta_bold_center";
  return "list_item_numbered";
}

function sniffImageMime(
  contentType: string | null,
  buffer: Buffer
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  const header = (contentType ?? "").split(";")[0]?.trim().toLowerCase();
  if (
    header === "image/jpeg" ||
    header === "image/png" ||
    header === "image/gif" ||
    header === "image/webp"
  ) {
    return header;
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "image/jpeg,image/png,image/webp,image/gif,*/*",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 32) return null;
    const mime = sniffImageMime(res.headers.get("content-type"), buffer);
    if (!mime) return null;
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAnalysisImageUrl(url: string): Promise<string> {
  const dataUrl = await imageUrlToDataUrl(url);
  return dataUrl ?? url;
}

function asTextRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

function normalizeExtractedText(
  layoutId: CarouselLayoutId,
  raw: unknown
): Record<string, string> {
  const incoming = asTextRecord(raw);
  const aliased: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming)) {
    const mapped = SLOT_ALIASES[key] ?? key;
    if (!(mapped in aliased) || !aliased[mapped]?.trim()) {
      aliased[mapped] = value;
    }
  }
  const normalized: Record<string, string> = {};
  for (const slotId of LAYOUT_SLOT_IDS[layoutId]) {
    const value = aliased[slotId]?.replace(/\s+/g, " ").trim() ?? "";
    normalized[slotId] = value;
  }
  return normalized;
}

function normalizeSlide(
  raw: unknown,
  index: number,
  total: number
): SourceCarouselSlideAnalysis {
  const row =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawLayout =
    typeof row.closestLayoutId === "string" ? row.closestLayoutId.trim() : "";
  const closestLayoutId = isCarouselLayoutId(rawLayout)
    ? rawLayout
    : fallbackLayoutId(index, total);
  return {
    closestLayoutId,
    extractedText: normalizeExtractedText(closestLayoutId, row.extractedText),
    imageStyleDescription:
      typeof row.imageStyleDescription === "string"
        ? row.imageStyleDescription.replace(/\s+/g, " ").trim()
        : "",
    hasPhoto: row.hasPhoto === true,
  };
}

/**
 * Analyze every source carousel slide image in one Claude Sonnet call
 * (same batching as analyzeReelFrames: all images in a single invokeLLM).
 */
export async function analyzeSourceCarousel(
  imageUrls: string[]
): Promise<SourceCarouselAnalysis> {
  const urls = imageUrls.map((url) => url.trim()).filter(Boolean).slice(0, MAX_SLIDES);
  if (urls.length === 0) {
    throw new Error("Could not analyze this carousel: no slide images were provided.");
  }

  const resolvedUrls = await Promise.all(urls.map(resolveAnalysisImageUrl));
  const imageBlocks = resolvedUrls.map((url) => ({
    type: "image_url" as const,
    image_url: {
      url,
      detail: "low" as const,
    },
  }));

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(
            "You analyze Instagram carousel slide images in order. Match each slide to the closest existing SpyReels layout, extract visible text into that layout's slot keys, and describe the photo style for a stock-photo search. Base your answer only on what is visible. Do not copy logos, watermarks, or identifiable faces into imageStyleDescription."
          ),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `These are ${urls.length} Instagram carousel slides in swipe order (slide 1 is first).

Match each slide to exactly one layout id from this catalog:
${LAYOUT_CATALOG}

For extractedText, fill only the slot keys that layout expects. Use empty strings for slots that are not on the slide. Copy the readable on-slide text; do not rewrite it.

imageStyleDescription should be a short subject/setting/lighting/mood query a stock-photo or image model can use. Describe style, not a literal recreation. If the slide is text-only, hasPhoto is false and imageStyleDescription can be empty.

Return one slides[] entry per image, in the same order.`,
            },
            ...imageBlocks,
          ],
        },
      ],
      maxTokens: 4096,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "source_carousel_analysis",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
    });

    const raw = String(response.choices[0]?.message?.content ?? "");
    const parsed = parseLlmJson<{ slides?: unknown }>(raw, {});
    const incoming = Array.isArray(parsed.slides) ? parsed.slides : [];
    const slides = urls.map((_, index) =>
      normalizeSlide(incoming[index], index, urls.length)
    );
    return { slides, resolvedImageUrls: resolvedUrls };
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("Could not analyze this carousel")
    ) {
      throw err;
    }
    console.warn(
      "[analyzeSourceCarousel] failed:",
      err instanceof Error ? err.message : err
    );
    throw new Error(
      "Could not analyze this carousel's slides. Please try a different Instagram post."
    );
  }
}
