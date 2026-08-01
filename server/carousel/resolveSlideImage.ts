import { storagePut } from "../storage";

const PEXELS_API_URL = "https://api.pexels.com/v1/search";

/**
 * Prefer a single short line for search (excuse / first segment), not a
 * joined multi-slot block that dilutes the query.
 */
export function extractPhotoSearchSubject(textContext: string | undefined): string {
  if (!textContext?.trim()) return "";
  const firstSegment = textContext.split(" / ")[0]?.trim() ?? textContext.trim();
  // Drop trailing punctuation noise; keep enough for a visual subject.
  return firstSegment.replace(/\s+/g, " ").slice(0, 90);
}

function buildCarouselImageQuery(
  niche: string,
  searchQueryHint: string,
  textContext?: string
): string {
  const subject = extractPhotoSearchSubject(textContext);
  const nichePart = niche.trim();
  const stylePart = searchQueryHint.trim();

  if (subject && nichePart) {
    return `${nichePart}: ${subject}. Style: ${stylePart}`.trim();
  }
  if (nichePart) {
    return `${nichePart}. Style: ${stylePart}`.trim();
  }
  if (subject) {
    return `${subject}. Style: ${stylePart}`.trim();
  }
  return stylePart;
}

async function searchPexelsPhoto(
  query: string,
  page = 1
): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    const url = `${PEXELS_API_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait&page=${Math.max(1, page)}`;
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

export type ResolveSlideImageOptions = {
  /** In-job set of already-used image URLs (not persisted). */
  usedUrls?: Set<string>;
  /** Appended on one Pexels retry when the first hit is a duplicate. */
  dedupeDifferentiator?: string;
};

/**
 * Resolve the final image URL for one image slot.
 * Priority: uploaded photo (if provided) > stock photo search (Pexels,
 * skipped gracefully if PEXELS_API_KEY is not set) > AI-generated fallback.
 *
 * Query order: niche + specific slot text lead; template mood hint trails
 * as Style: so stock/AI do not ignore the niche for generic lifestyle hits.
 *
 * When `usedUrls` is provided, a duplicate Pexels hit triggers one retry
 * (modified query + page 2) before AI fallback.
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

  const query = buildCarouselImageQuery(niche, searchQueryHint, textContext);
  console.log("[carousel-image-query]", query);

  let stockUrl = await searchPexelsPhoto(query);
  if (stockUrl && options?.usedUrls?.has(stockUrl)) {
    const diff = options.dedupeDifferentiator?.trim() || "alternate framing";
    const retryQuery = `${query} ${diff}`.trim();
    console.warn(
      `[resolveSlideImage] duplicate URL, one Pexels retry: ${stockUrl}`
    );
    console.log("[carousel-image-query-dedupe-retry]", retryQuery);
    const retried = await searchPexelsPhoto(retryQuery, 2);
    stockUrl = retried && !options.usedUrls.has(retried) ? retried : null;
  }

  if (stockUrl) {
    options?.usedUrls?.add(stockUrl);
    return stockUrl;
  }

  const aiUrl = await generateAiFallbackImage(query);
  if (aiUrl) {
    options?.usedUrls?.add(aiUrl);
  }
  return aiUrl;
}
