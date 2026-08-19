import type {
  BrandSettings,
  CarouselInputMode,
  GenerateInput,
  PipelineResult,
  RemixMode,
  TemplateId,
} from "../types";

/** Ports for future real providers. Mock implements these today. */

export type ContentExtraction = {
  title: string;
  plainText: string;
  sourceKind: CarouselInputMode;
};

export type NarrativePlan = {
  hook: string;
  storyBeats: string[];
  cta: string;
  caption: string;
};

export type CarouselPlan = {
  templateId: TemplateId;
  slides: PipelineResult["slides"];
  caption: string;
  title: string;
  analysis: PipelineResult["analysis"];
};

export type CrawlerPort = {
  fetchSource: (input: GenerateInput) => Promise<ContentExtraction>;
};

export type NarrativeBuilderPort = {
  build: (
    extraction: ContentExtraction,
    remixMode?: RemixMode
  ) => Promise<NarrativePlan>;
};

export type CarouselPlannerPort = {
  plan: (
    narrative: NarrativePlan,
    extraction: ContentExtraction,
    remixMode?: RemixMode
  ) => Promise<CarouselPlan>;
};

export type BrandApplicatorPort = {
  apply: (plan: CarouselPlan, brand: BrandSettings) => CarouselPlan;
};
