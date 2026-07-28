import { storagePut } from "../storage";

const PEXELS_API_URL = "https://api.pexels.com/v1/search";

async function searchPexelsPhoto(query: string): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    const url = `${PEXELS_API_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`;
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      photos?: Array<{ src?: { large?: string; original?: string } }>;
    };
    const photo = data.photos?.[0];
    return photo?.src?.large ?? photo?.src?.original ?? null;
  } catch (err) {
    console.warn("[resolveSlideImage] Pexels search failed", err);
    return null;
  }
}

async function generateAiFallbackImage(query: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[resolveSlideImage] OPENAI_API_KEY not set, skipping AI fallback");
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
        prompt: `A high-quality, realistic photo for a social media carousel slide: ${query}. No text, no logos, no watermarks, no borders.`,
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

/**
 * Resolve the final image URL for one image slot.
 * Priority: uploaded photo (if provided) > stock photo search (Pexels,
 * skipped gracefully if PEXELS_API_KEY is not set) > AI-generated fallback.
 */
export async function resolveSlideImage(
  searchQueryHint: string,
  niche: string,
  uploadedUrl?: string
): Promise<string | null> {
  if (uploadedUrl) {
    return uploadedUrl;
  }

  const query = `${searchQueryHint}, ${niche}`.trim();

  const stockUrl = await searchPexelsPhoto(query);
  if (stockUrl) {
    return stockUrl;
  }

  return generateAiFallbackImage(query);
}
