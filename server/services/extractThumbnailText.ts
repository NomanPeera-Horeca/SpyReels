import { invokeLLM } from "../_core/llm";
import { sanitizeAiOutput } from "../utils/sanitizeAiOutput";

/**
 * Read visible text on a Reel cover thumbnail via vision model.
 * Returns empty string when there is no readable text.
 */
export async function extractThumbnailText(
  thumbnailUrl: string
): Promise<string> {
  const url = thumbnailUrl.trim();
  if (!url) return "";

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "This image is an Instagram Reel cover thumbnail. " +
                "List every piece of readable text you see (headlines, captions burned into the image, stickers with words). " +
                "Return ONLY that text, joined with spaces. If there is no text, return an empty string. No explanation.",
            },
            {
              type: "image_url",
              image_url: { url, detail: "low" },
            },
          ],
        },
      ],
      maxTokens: 200,
      temperature: 0,
    });

    const raw = String(response.choices[0]?.message?.content ?? "").trim();
    const cleaned = sanitizeAiOutput(raw).replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.toLowerCase() === "empty string") return "";
    return cleaned.length > 512 ? cleaned.slice(0, 512) : cleaned;
  } catch (err) {
    console.warn(
      "[extractThumbnailText] failed:",
      err instanceof Error ? err.message : err
    );
    return "";
  }
}
