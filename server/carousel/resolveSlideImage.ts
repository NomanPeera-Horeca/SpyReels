import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { withAiFormattingRules } from "../utils/aiFormattingRules";

/**
 * Prefer a single short line from slot text for text-only image prompts
 * (excuse / first segment), not a joined multi-slot block.
 */
function extractSlideSubject(textContext: string | undefined): string {
  if (!textContext?.trim()) return "";
  const firstSegment = textContext.split(" / ")[0]?.trim() ?? textContext.trim();
  return firstSegment.replace(/\s+/g, " ").slice(0, 90);
}

/** Text-only gpt-image prompt when no source visual is available (Path C). */
export function buildTextOnlyImagePrompt(
  niche: string,
  searchQueryHint: string,
  textContext?: string
): string {
  const subject = extractSlideSubject(textContext);
  const nichePart = niche.trim();
  const stylePart = searchQueryHint.trim();
  const parts: string[] = [];
  if (nichePart) parts.push(`Niche: ${nichePart}`);
  if (subject) parts.push(`Slide message: ${subject}`);
  if (stylePart) parts.push(`Visual mood: ${stylePart}`);
  const context = parts.join(". ");
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
  searchQueryHint = ""
): Promise<string> {
  const trimmedSource = sourceImage?.trim() || null;
  if (!trimmedSource) {
    return buildTextOnlyImagePrompt(niche, searchQueryHint, slideText);
  }

  const slideLine = extractSlideSubject(slideText) || slideText.trim().slice(0, 120);
  const nichePart = niche.trim() || "General creators";
  const stylePart = searchQueryHint.trim();

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(
            "You write image-generation prompts for Instagram carousel slide backgrounds. Given a source photo and the remade slide text, describe a NEW photo that visually rhymes with the source (subject type, mood, composition, color palette, lighting) while fitting the slide message. Do not literally illustrate the caption as text-on-image. Do not copy logos, watermarks, or identifiable faces. Reply with ONLY the image prompt as plain text, one paragraph, no quotes or labels."
          ),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Niche / audience: ${nichePart}
Slide headline / text: ${slideLine || "(no text)"}
${stylePart ? `Style hint: ${stylePart}\n` : ""}
Write a gpt-image-1.5 prompt for a high-quality realistic photo (portrait orientation). No text, logos, watermarks, or borders in the image.`,
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

  return buildTextOnlyImagePrompt(niche, searchQueryHint, slideText);
}

async function generateAiImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[resolveSlideImage] OPENAI_API_KEY not set, skipping AI image");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
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
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[resolveSlideImage] OpenAI image generation failed (${response.status})${detail ? `: ${detail}` : ""}`
      );
      return null;
    }

    const result = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const first = result.data?.[0];
    if (!first) {
      return null;
    }

    // Prefer a direct URL if OpenAI ever returns one; otherwise decode the
    // base64 payload and store it in R2 ourselves (matches existing
    // storagePut pattern used elsewhere in the app).
    if (first.url) {
      return first.url;
    }
    if (first.b64_json) {
      const buffer = Buffer.from(first.b64_json, "base64");
      const { url } = await storagePut(
        `generated/carousel/${Date.now()}.png`,
        buffer,
        "image/png"
      );
      return url;
    }

    return null;
  } catch (err) {
    console.warn("[resolveSlideImage] AI image generation failed", err);
    return null;
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
  if (uploadedUrl) {
    options?.usedUrls?.add(uploadedUrl);
    return uploadedUrl;
  }

  const prompt = await buildVisionGroundedImagePrompt(
    options?.sourceImage ?? null,
    textContext ?? "",
    niche,
    searchQueryHint
  );
  console.log(
    "[carousel-image-prompt]",
    prompt.slice(0, 200) + (prompt.length > 200 ? "..." : "")
  );

  const aiUrl = await generateAiImage(prompt);
  if (aiUrl) {
    options?.usedUrls?.add(aiUrl);
  }
  return aiUrl;
}
