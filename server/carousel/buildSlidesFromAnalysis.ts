import type {
  CarouselImageSlot,
  CarouselLayoutId,
  CarouselSlideRole,
  CarouselSlideSpec,
  CarouselSlotRole,
  CarouselTextSlot,
} from "@shared/carouselTemplates";
import type { SourceCarouselAnalysis } from "./analyzeSourceCarousel";

type LayoutSlotDef = {
  id: string;
  role: CarouselSlotRole;
  label: string;
  budget: { min: number; max: number };
  fallback: string;
};

type LayoutImageDef = {
  id: string;
  label: string;
};

const LAYOUT_SLOT_DEFS: Record<CarouselLayoutId, readonly LayoutSlotDef[]> = {
  hook_bold_center: [
    { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, fallback: "CREATORS" },
    { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, fallback: "This is the hook line" },
    { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, fallback: "One clear promise that makes the viewer swipe." },
  ],
  list_item_numbered: [
    { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, fallback: "01" },
    { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, fallback: "One concrete point" },
    { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, fallback: "Explain the point in one tight paragraph the viewer can screenshot." },
  ],
  cta_bold_center: [
    { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, fallback: "Save this for later" },
    { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, fallback: "Follow for more breakdowns you can post this week." },
    { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, fallback: "Follow for more" },
  ],
  hook_photo_top: [
    { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, fallback: "REAL RESULT" },
    { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, fallback: "This is what changed" },
    { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, fallback: "A photo plus a specific promise that invites a swipe." },
  ],
  photo_caption_bubble: [
    { id: "headline", role: "headline", label: "Caption", budget: { min: 40, max: 140 }, fallback: "Say the main idea in one conversational caption the viewer can read in a second." },
  ],
  notebook_cover: [
    { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 64 }, fallback: "How to do this without burning out" },
    { id: "subhead", role: "subhead", label: "Swipe line", budget: { min: 6, max: 18 }, fallback: "Swipe ->" },
    { id: "kicker", role: "kicker", label: "Arrow label", budget: { min: 8, max: 22 }, fallback: "start here" },
  ],
  notebook_list_item: [
    { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, fallback: "1" },
    { id: "headline", role: "headline", label: "Tip title", budget: { min: 14, max: 48 }, fallback: "Do the small version first" },
    { id: "body", role: "body", label: "Tip body", budget: { min: 50, max: 160 }, fallback: "Give one rule the reader can apply today without extra tools or a new system." },
  ],
  list_item_warm_numbered: [
    { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, fallback: "1" },
    { id: "headline", role: "headline", label: "Heading", budget: { min: 14, max: 48 }, fallback: "Name the feeling first" },
    { id: "body", role: "body", label: "Body", budget: { min: 50, max: 160 }, fallback: "A warm, direct line the reader can say out loud when the moment gets tense." },
    { id: "callout", role: "body_callout", label: "Callout list", budget: { min: 20, max: 120 }, fallback: "Stay curious\nAsk one question\nKeep the tone even" },
  ],
  quote_tweet_card: [
    { id: "headline", role: "headline", label: "Quote", budget: { min: 40, max: 140 }, fallback: "Write one screenshot-worthy line that names the standard and makes it personal." },
  ],
  excuse_grid_4: [
    { id: "excuse_tl", role: "headline", label: "Excuse top left", budget: { min: 8, max: 36 }, fallback: "I don't have time." },
    { id: "excuse_tr", role: "headline", label: "Excuse top right", budget: { min: 8, max: 36 }, fallback: "I'm too busy." },
    { id: "excuse_bl", role: "headline", label: "Excuse bottom left", budget: { min: 8, max: 36 }, fallback: "I'm too tired." },
    { id: "excuse_br", role: "headline", label: "Excuse bottom right", budget: { min: 8, max: 36 }, fallback: "I'll start later." },
  ],
  excuse_split_stack: [
    { id: "excuse", role: "headline", label: "Excuse", budget: { min: 8, max: 40 }, fallback: "I don't have time." },
    { id: "reframe", role: "body", label: "Reframe", budget: { min: 8, max: 40 }, fallback: "I'll do a small version." },
  ],
  stat_split_stack: [
    { id: "average", role: "headline", label: "Average line", budget: { min: 18, max: 56 }, fallback: "The average creator quits in 90 days" },
    { id: "not_line", role: "body", label: "Not line", budget: { min: 5, max: 28 }, fallback: "Not you" },
  ],
  photo_quote_bubbles: [
    { id: "quote", role: "headline", label: "Quote", budget: { min: 40, max: 140 }, fallback: "People overestimate one week and underestimate what six months of reps can do." },
    { id: "cta_label", role: "cta_label", label: "CTA", budget: { min: 12, max: 48 }, fallback: "Save this and keep going" },
  ],
};

const LAYOUT_IMAGE_DEFS: Record<CarouselLayoutId, readonly LayoutImageDef[]> = {
  hook_bold_center: [],
  list_item_numbered: [],
  cta_bold_center: [],
  hook_photo_top: [{ id: "photo", label: "Photo" }],
  photo_caption_bubble: [{ id: "photo", label: "Photo" }],
  notebook_cover: [{ id: "photo", label: "Photo" }],
  notebook_list_item: [],
  list_item_warm_numbered: [],
  quote_tweet_card: [{ id: "avatar", label: "Profile photo" }],
  excuse_grid_4: [
    { id: "photo_tl", label: "Excuse photo top left" },
    { id: "photo_tr", label: "Excuse photo top right" },
    { id: "photo_bl", label: "Excuse photo bottom left" },
    { id: "photo_br", label: "Excuse photo bottom right" },
  ],
  excuse_split_stack: [
    { id: "photo_before", label: "Excuse photo (before)" },
    { id: "photo_after", label: "Reframe photo (after / win)" },
  ],
  stat_split_stack: [
    { id: "photo_top", label: "Success outcome photo (win)" },
    { id: "photo_bottom", label: "Early grind photo (before)" },
  ],
  photo_quote_bubbles: [{ id: "photo", label: "Closer photo" }],
};

const IMAGE_HINT_SUFFIX: Record<string, string> = {
  photo_tl: "top left frame",
  photo_tr: "top right frame",
  photo_bl: "bottom left frame",
  photo_br: "bottom right frame",
  photo_before: "quieter before moment",
  photo_after: "confident after moment",
  photo_top: "successful outcome, warm light",
  photo_bottom: "early grind, candid night energy",
  avatar: "clean headshot portrait",
};

function clampDefaultText(value: string, fallback: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  const source = trimmed || fallback;
  return source.length > max ? source.slice(0, max) : source;
}

function slideRole(index: number, total: number): CarouselSlideRole {
  if (index === 0) return "hook";
  if (total > 1 && index === total - 1) return "cta";
  return "list_item";
}

function viralWhyForRole(role: CarouselSlideRole): string {
  if (role === "hook") {
    return "Stops the scroll with a clear promise matching the source cover.";
  }
  if (role === "cta") {
    return "Close with one clear action the viewer can take.";
  }
  return "One concrete point per slide so the viewer keeps swiping.";
}

function buildSlots(
  layoutId: CarouselLayoutId,
  extractedText: Record<string, string>,
  index: number
): CarouselTextSlot[] {
  return LAYOUT_SLOT_DEFS[layoutId].map((def) => {
    let extracted = extractedText[def.id] ?? "";
    if (def.label === "Number" && !extracted.trim()) {
      extracted = String(index).padStart(2, "0").slice(-2);
    }
    return {
      id: def.id,
      role: def.role,
      label: def.label,
      budget: def.budget,
      defaultText: clampDefaultText(extracted, def.fallback, def.budget.max),
    };
  });
}

function buildImageSlots(
  layoutId: CarouselLayoutId,
  hasPhoto: boolean,
  imageStyleDescription: string
): CarouselImageSlot[] | undefined {
  if (!hasPhoto) return undefined;
  const defs = LAYOUT_IMAGE_DEFS[layoutId];
  if (defs.length === 0) return undefined;
  const baseHint =
    imageStyleDescription.trim() ||
    "lifestyle photo matching the slide topic, natural light";
  return defs.map((def) => {
    const suffix = IMAGE_HINT_SUFFIX[def.id];
    return {
      id: def.id,
      label: def.label,
      searchQueryHint: suffix ? `${baseHint}, ${suffix}` : baseHint,
    };
  });
}

/**
 * Turn vision analysis into renderer-ready slide specs.
 * Layout, slot ids, and image regions come from the source slides.
 */
export function buildSlidesFromAnalysis(
  analysis: SourceCarouselAnalysis
): CarouselSlideSpec[] {
  const total = analysis.slides.length;
  return analysis.slides.map((slide, index) => {
    const role = slideRole(index, total);
    const imageSlots = buildImageSlots(
      slide.closestLayoutId,
      slide.hasPhoto,
      slide.imageStyleDescription
    );
    return {
      id: `slide_${String(index + 1).padStart(2, "0")}`,
      role,
      viralWhy: viralWhyForRole(role),
      layoutId: slide.closestLayoutId,
      slots: buildSlots(slide.closestLayoutId, slide.extractedText, index + 1),
      ...(imageSlots ? { imageSlots } : {}),
    };
  });
}

export function sourceContentFromAnalysis(
  analysis: SourceCarouselAnalysis
): string {
  const blocks = analysis.slides.map((slide, index) => {
    const lines = Object.entries(slide.extractedText)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => `${key}: ${value.trim()}`);
    return `Slide ${index + 1} (${slide.closestLayoutId}${
      slide.hasPhoto ? ", has photo" : ""
    }):\n${lines.join("\n") || "(no readable text)"}`;
  });
  return `Source Instagram carousel slide text (adapt each slide to the creator niche; keep the same beat and slot roles per slide):\n\n${blocks.join("\n\n")}`;
}
