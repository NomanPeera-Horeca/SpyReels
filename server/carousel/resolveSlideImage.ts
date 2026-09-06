import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import {
  getActiveGenerationTelemetry,
  withGenerationStage,
  type GenerationTelemetryContext,
} from "./generationTelemetry";

/**
 * Prefer a single short line from slot text for text-only image prompts
 * (excuse / first segment), not a joined multi-slot block.
 */
function extractSlideSubject(textContext: string | undefined): string {
  if (!textContext?.trim()) return "";
  const firstSegment = textContext.split(" / ")[0]?.trim() ?? textContext.trim();
  return firstSegment.replace(/\s+/g, " ").slice(0, 90);
}

export type VisionImagePromptOptions = {
  topic?: string | null;
  slidePurpose?: string | null;
  slotPurpose?: string | null;
  requireTopicFit?: boolean;
};

/** Text-only gpt-image prompt when no source visual is available (Path C). */
export function buildTextOnlyImagePrompt(
  niche: string,
  searchQueryHint: string,
  textContext?: string,
  options?: VisionImagePromptOptions
): string {
  const subject = extractSlideSubject(textContext);
  const nichePart = niche.trim();
  const stylePart = searchQueryHint.trim();
  const topic = options?.topic?.trim() ?? "";
  const slidePurpose = options?.slidePurpose?.trim() ?? "";
  const slotPurpose = options?.slotPurpose?.trim() ?? "";
  const parts: string[] = [];
  if (nichePart) parts.push(`Niche: ${nichePart}`);
  if (topic) parts.push(`Carousel topic: ${topic}`);
  if (subject) parts.push(`Slide message: ${subject}`);
  if (slidePurpose) parts.push(`Slide job: ${slidePurpose}`);
  if (slotPurpose) parts.push(`Image slot: ${slotPurpose}`);
  if (stylePart) parts.push(`Visual mood: ${stylePart}`);
  const context = parts.join(". ");
  if (options?.requireTopicFit) {
    return `A high-quality, realistic photo for a social media carousel slide. ${context}. The photo must visually belong to this topic and slide. Do not invent an unrelated scene. No captions, headlines, logos, watermarks, fake UI, random letters, or borders.`;
  }
  return `A high-quality, realistic photo for a social media carousel slide. ${context}. No text, no logos, no watermarks, no borders.`;
}

/**
 * When a source still exists, ask Claude (vision) for a descriptive
 * gpt-image-1.5 prompt that visually rhymes with the slide message.
 * Falls back to text-only construction when sourceImage is null/empty
 * or the vision call fails.
 */
export async function buildVisionGroundedImagePrompt(
  sourceImage: string | null,
  slideText: string,
  niche: string,
  searchQueryHint = "",
  options?: VisionImagePromptOptions
): Promise<string> {
  const trimmedSource = sourceImage?.trim() || null;
  if (!trimmedSource) {
    return buildTextOnlyImagePrompt(niche, searchQueryHint, slideText, options);
  }

  const slideLine = extractSlideSubject(slideText) || slideText.trim().slice(0, 120);
  const nichePart = niche.trim() || "General creators";
  const stylePart = searchQueryHint.trim();
  const topic = options?.topic?.trim() ?? "";
  const slidePurpose = options?.slidePurpose?.trim() ?? "";
  const slotPurpose = options?.slotPurpose?.trim() ?? "";
  const topicRule = options?.requireTopicFit
    ? " The new photo must clearly belong to the carousel topic and this slide. Do not drift into a generic influencer, beach, laptop, or unrelated food shot unless that is the actual subject."
    : "";

  try {
    const response = await invokeLLM({
      operation: "image_prompt_generation",
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(
            options?.requireTopicFit
              ? "You write image-generation prompts for Instagram carousel slide backgrounds. Given a source photo and the remade slide text, describe a NEW photo that visually rhymes with the source (subject type, mood, composition, color palette, lighting) while fitting the slide message. Do not make a pixel copy. Do not literally illustrate the caption as text-on-image. Do not copy logos, watermarks, captions, fake UI, or identifiable faces. Reply with ONLY the image prompt as plain text, one paragraph, no quotes or labels."
              : "You write image-generation prompts for Instagram carousel slide backgrounds. Given a source photo and the remade slide text, describe a NEW photo that visually rhymes with the source (subject type, mood, composition, color palette, lighting) while fitting the slide message. Do not literally illustrate the caption as text-on-image. Do not copy logos, watermarks, or identifiable faces. Reply with ONLY the image prompt as plain text, one paragraph, no quotes or labels."
          ),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Niche / audience: ${nichePart}
${topic ? `Carousel topic: ${topic}\n` : ""}Slide headline / text: ${slideLine || "(no text)"}
${slidePurpose ? `Slide job: ${slidePurpose}\n` : ""}${slotPurpose ? `Image slot: ${slotPurpose}\n` : ""}${stylePart ? `Style hint: ${stylePart}\n` : ""}
Write a gpt-image-1.5 prompt for a high-quality realistic photo (portrait orientation). ${
                options?.requireTopicFit
                  ? `Create a fresh image, not a copy.${topicRule} No captions, headlines, logos, watermarks, fake UI, random letters, or borders in the image.`
                  : "No text, logos, watermarks, or borders in the image."
              }`,
            },
            {
              type: "image_url",
              image_url: {
                url: trimmedSource,
                detail: "low",
              },
            },
          ],
        },
      ],
      maxTokens: 400,
      temperature: 0.4,
    });

    const raw = String(response.choices[0]?.message?.content ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (raw.length >= 24) {
      return raw;
    }
  } catch (err) {
    console.warn(
      "[resolveSlideImage] vision-grounded prompt failed, using text-only",
      err instanceof Error ? err.message : err
    );
  }

  return buildTextOnlyImagePrompt(niche, searchQueryHint, slideText, options);
}

type GeneratedImageOutcome = {
  url: string | null;
  apiRequestSucceeded: boolean;
  imageReturned: boolean;
  storageSucceeded: boolean;
  errorCategory: string | null;
};

async function generateAiImage(prompt: string): Promise<GeneratedImageOutcome> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[resolveSlideImage] OPENAI_API_KEY not set, skipping AI image");
    return {
      url: null,
      apiRequestSucceeded: false,
      imageReturned: false,
      storageSucceeded: false,
      errorCategory: "auth",
    };
  }

  try {
    const response = await withGenerationStage(
      getActiveGenerationTelemetry(),
      "image_generation",
      () =>
        fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-image-1.5",
            prompt,
            n: 1,
            size: "1024x1536",
          }),
        })
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[resolveSlideImage] OpenAI image generation failed (${response.status})${detail ? `: ${detail}` : ""}`
      );
      return {
        url: null,
        apiRequestSucceeded: false,
        imageReturned: false,
        storageSucceeded: false,
        errorCategory: response.status === 429 ? "rate_limit" : "image_api",
      };
    }

    const result = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const first = result.data?.[0];
    if (!first) {
      return {
        url: null,
        apiRequestSucceeded: true,
        imageReturned: false,
        storageSucceeded: false,
        errorCategory: "image_api",
      };
    }

    // Prefer a direct URL if OpenAI ever returns one; otherwise decode the
    // base64 payload and store it in R2 ourselves (matches existing
    // storagePut pattern used elsewhere in the app).
    if (first.url) {
      return {
        url: first.url,
        apiRequestSucceeded: true,
        imageReturned: true,
        storageSucceeded: true,
        errorCategory: null,
      };
    }
    if (first.b64_json) {
      const buffer = Buffer.from(first.b64_json, "base64");
      try {
        const { url } = await withGenerationStage(
          getActiveGenerationTelemetry(),
          "image_storage",
          () =>
            storagePut(
              `generated/carousel/${Date.now()}.png`,
              buffer,
              "image/png"
            )
        );
        return {
          url,
          apiRequestSucceeded: true,
          imageReturned: true,
          storageSucceeded: true,
          errorCategory: null,
        };
      } catch (err) {
        console.warn("[resolveSlideImage] AI image storage failed", err);
        return {
          url: null,
          apiRequestSucceeded: true,
          imageReturned: true,
          storageSucceeded: false,
          errorCategory: "storage",
        };
      }
    }

    return {
      url: null,
      apiRequestSucceeded: true,
      imageReturned: false,
      storageSucceeded: false,
      errorCategory: "image_api",
    };
  } catch (err) {
    console.warn("[resolveSlideImage] AI image generation failed", err);
    return {
      url: null,
      apiRequestSucceeded: false,
      imageReturned: false,
      storageSucceeded: false,
      errorCategory: "image_api",
    };
  }
}

export type ResolveSlideImageOptions = {
  /** In-job set of already-used image URLs (not persisted). */
  usedUrls?: Set<string>;
  /**
   * Source still for vision grounding: base64 data URL or http(s) URL.
   * Path A: matching carousel still. Path B: reel thumbnail. Path C: omit.
   */
  sourceImage?: string | null;
  slideId?: string;
  imageSlotId?: string;
  telemetry?: GenerationTelemetryContext;
  topic?: string | null;
  slidePurpose?: string | null;
  slotPurpose?: string | null;
  requireTopicFit?: boolean;
};

/**
 * Resolve the final image URL for one image slot.
 * Priority: uploaded photo (if provided) > vision-grounded or text-only
 * prompt > gpt-image-1.5 > R2 public URL.
 */
export async function resolveSlideImage(
  searchQueryHint: string,
  niche: string,
  uploadedUrl?: string,
  textContext?: string,
  options?: ResolveSlideImageOptions
): Promise<string | null> {
  const telemetry = options?.telemetry ?? getActiveGenerationTelemetry();
  const slideId = options?.slideId ?? "unknown_slide";
  const imageSlotId = options?.imageSlotId ?? "unknown_slot";

  if (uploadedUrl) {
    options?.usedUrls?.add(uploadedUrl);
    try {
      telemetry?.collector.recordImageSlot({
        slideId,
        imageSlotId,
        sourcePath: "uploaded",
        model: null,
        requestedSize: null,
        requestedQuality: null,
        attemptNumber: 1,
        durationMs: 0,
        apiRequestSucceeded: false,
        imageReturned: true,
        storageSucceeded: true,
        slotResolved: true,
        retryCount: 0,
        errorCategory: null,
      });
    } catch (err) {
      console.error("[carouselTelemetry] uploaded image record failed", err);
    }
    return uploadedUrl;
  }

  const prompt = await withGenerationStage(
    telemetry,
    "image_prompt_generation",
    () =>
      buildVisionGroundedImagePrompt(
        options?.sourceImage ?? null,
        textContext ?? "",
        niche,
        searchQueryHint,
        {
          topic: options?.topic,
          slidePurpose: options?.slidePurpose,
          slotPurpose: options?.slotPurpose,
          requireTopicFit: options?.requireTopicFit,
        }
      )
  );
  console.log(
    "[carousel-image-prompt]",
    prompt.slice(0, 200) + (prompt.length > 200 ? "..." : "")
  );

  const imageStarted = performance.now();
  const generated = await generateAiImage(prompt);

  const aiUrl = generated.url;
  try {
    telemetry?.collector.recordImageSlot({
      slideId,
      imageSlotId,
      sourcePath: "generated",
      model: "gpt-image-1.5",
      requestedSize: "1024x1536",
      requestedQuality: "default",
      attemptNumber: 1,
      durationMs: Math.max(0, Math.round(performance.now() - imageStarted)),
      apiRequestSucceeded: generated.apiRequestSucceeded,
      imageReturned: generated.imageReturned,
      storageSucceeded: generated.storageSucceeded,
      slotResolved: Boolean(aiUrl),
      retryCount: 0,
      errorCategory: generated.errorCategory,
    });
  } catch (err) {
    console.error("[carouselTelemetry] generated image record failed", err);
  }

  if (aiUrl) {
    options?.usedUrls?.add(aiUrl);
  }
  return aiUrl;
}
