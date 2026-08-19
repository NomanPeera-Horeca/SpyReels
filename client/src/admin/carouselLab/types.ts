export type CarouselInputMode = "article" | "youtube" | "carousel" | "paste";

export type SlideRole = "hook" | "story" | "point" | "cta";

export type TemplateId =
  | "authority"
  | "editorial"
  | "modern"
  | "apple"
  | "magazine"
  | "bold"
  | "luxury"
  | "minimal"
  | "corporate"
  | "dark";

export type RemixMode =
  | "improve_everything"
  | "stronger_hook"
  | "better_story"
  | "more_original"
  | "better_design"
  | "different_audience"
  | "educational"
  | "viral"
  | "luxury_brand";

export type CarouselSlide = {
  id: string;
  role: SlideRole;
  headline: string;
  body: string;
  imageUrl?: string;
  backgroundOverride?: string;
};

export type BrandSettings = {
  handle: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  fontPair: "inter" | "serif" | "mono";
};

export type RemixAnalysis = {
  hook: number;
  story: number;
  readability: number;
  visualHierarchy: number;
  cta: number;
  estimatedImprovementPercent: number;
};

export type PipelineProgressStep =
  | "reading"
  | "extracting"
  | "ideas"
  | "narrative"
  | "template"
  | "rendering";

export type PipelineResult = {
  title: string;
  caption: string;
  templateId: TemplateId;
  slides: CarouselSlide[];
  analysis: RemixAnalysis | null;
};

export type GenerateInput = {
  mode: CarouselInputMode;
  source: string;
  remixMode?: RemixMode;
};

export const DEFAULT_BRAND: BrandSettings = {
  handle: "@spyreels",
  logoUrl: "",
  primaryColor: "#7c3aed",
  secondaryColor: "#0f172a",
  fontPair: "inter",
};

export const PIPELINE_STEPS: { id: PipelineProgressStep; label: string }[] = [
  { id: "reading", label: "Reading source..." },
  { id: "extracting", label: "Extracting insights..." },
  { id: "ideas", label: "Finding strongest ideas..." },
  { id: "narrative", label: "Writing narrative..." },
  { id: "template", label: "Selecting best template..." },
  { id: "rendering", label: "Rendering carousel..." },
];

export const REMIX_MODE_OPTIONS: { id: RemixMode; label: string }[] = [
  { id: "improve_everything", label: "Improve everything" },
  { id: "stronger_hook", label: "Stronger Hook" },
  { id: "better_story", label: "Better Story" },
  { id: "more_original", label: "More Original" },
  { id: "better_design", label: "Better Design" },
  { id: "different_audience", label: "Different Audience" },
  { id: "educational", label: "Turn into Educational" },
  { id: "viral", label: "Turn into Viral" },
  { id: "luxury_brand", label: "Turn into Luxury Brand" },
];
