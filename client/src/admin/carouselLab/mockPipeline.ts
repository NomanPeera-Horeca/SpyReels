import type {
  CarouselInputMode,
  CarouselSlide,
  GenerateInput,
  PipelineResult,
  RemixAnalysis,
  RemixMode,
  TemplateId,
} from "./types";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function baseAnalysis(mode: CarouselInputMode): RemixAnalysis | null {
  if (mode !== "carousel") return null;
  return {
    hook: 82,
    story: 91,
    readability: 76,
    visualHierarchy: 80,
    cta: 64,
    estimatedImprovementPercent: 34,
  };
}

function templateForMode(mode: CarouselInputMode, remix?: RemixMode): TemplateId {
  if (remix === "luxury_brand") return "luxury";
  if (remix === "viral") return "bold";
  if (remix === "educational") return "corporate";
  if (remix === "better_design") return "apple";
  if (mode === "youtube") return "modern";
  if (mode === "carousel") return "editorial";
  if (mode === "article") return "authority";
  return "minimal";
}

function remixHeadlineTwist(headline: string, remix?: RemixMode): string {
  if (!remix || remix === "improve_everything") return headline;
  if (remix === "stronger_hook") return headline.replace(/\.$/, "") + " (and most people miss this)";
  if (remix === "viral") return "Stop scrolling. " + headline;
  if (remix === "luxury_brand") return headline.replace(/\b\w/g, (c) => c.toUpperCase());
  if (remix === "educational") return "Lesson: " + headline;
  return headline;
}

function buildSlides(
  mode: CarouselInputMode,
  source: string,
  remix?: RemixMode
): CarouselSlide[] {
  const snippet = source.trim().slice(0, 80) || "your content";
  const hooks: Record<CarouselInputMode, string> = {
    article: "Most articles bury the only line that matters.",
    youtube: "This video has one idea worth a whole carousel.",
    carousel: "The original was good. This version is sharper.",
    paste: "Your draft already has a hook hiding in it.",
  };

  const hook = remixHeadlineTwist(hooks[mode], remix);
  const slides: CarouselSlide[] = [
    {
      id: uid("s"),
      role: "hook",
      headline: hook,
      body: `Built from: ${snippet}${source.length > 80 ? "…" : ""}`,
    },
    {
      id: uid("s"),
      role: "story",
      headline: "The real problem",
      body:
        mode === "carousel"
          ? "We kept the story spine, cut soft transitions, and moved the tension earlier."
          : "Creators drown in source material. The win is choosing one tension and protecting it.",
    },
    {
      id: uid("s"),
      role: "point",
      headline: "Insight 1",
      body: "Lead with a concrete claim in the first frame. Vague openings lose the swipe.",
    },
    {
      id: uid("s"),
      role: "point",
      headline: "Insight 2",
      body: "One idea per slide. If you need two sentences, make a second slide.",
    },
    {
      id: uid("s"),
      role: "point",
      headline: "Insight 3",
      body: "End each beat with a reason to keep going, not a neat conclusion.",
    },
    {
      id: uid("s"),
      role: "cta",
      headline: remix === "viral" ? "Save this. Share it with a founder." : "Try this on your next post",
      body: "Follow for more breakdowns. Remix this structure with your niche proof.",
    },
  ];

  if (remix === "better_story") {
    slides[1] = {
      ...slides[1]!,
      headline: "A sharper story arc",
      body: "Setup in slide 1, tension in 2 to 3, proof in 4, payoff + CTA last.",
    };
  }
  if (remix === "more_original") {
    slides[2] = {
      ...slides[2]!,
      headline: "A take they have not heard",
      body: "Swap generic advice for a named mistake you see every week in your niche.",
    };
  }
  return slides;
}

export function mockBuildPipelineResult(input: GenerateInput): PipelineResult {
  const templateId = templateForMode(input.mode, input.remixMode);
  const slides = buildSlides(input.mode, input.source, input.remixMode);
  const titles: Record<CarouselInputMode, string> = {
    article: "Article → carousel",
    youtube: "YouTube → carousel",
    carousel: "Carousel remix",
    paste: "Text → carousel",
  };
  return {
    title: titles[input.mode],
    caption:
      "Most people overcomplicate carousels.\n\nSteal this structure:\n1) Hook with tension\n2) One insight per slide\n3) Clear CTA\n\nBuilt in SpyReels Carousel Lab (admin prototype).",
    templateId,
    slides,
    analysis: baseAnalysis(input.mode),
  };
}
