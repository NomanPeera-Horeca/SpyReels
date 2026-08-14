/**
 * Stock photo search for carousel backgrounds (Pexels primary, Pixabay fallback).
 */

export type StockPhotoProvider = "pexels" | "pixabay" | "auto";

export type StockPhotoResult = {
  id: string;
  url: string;
  thumbUrl: string;
  provider: "pexels" | "pixabay";
  photographer?: string;
};

const PEXELS_API_URL = "https://api.pexels.com/v1/search";
const PIXABAY_PHOTO_API_URL = "https://pixabay.com/api/";

async function searchPexelsPhotos(
  query: string,
  page: number,
  perPage: number
): Promise<StockPhotoResult[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `${PEXELS_API_URL}?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait&page=${Math.max(1, page)}`;
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      photos?: Array<{
        id?: number;
        photographer?: string;
        src?: { large?: string; medium?: string; original?: string };
      }>;
    };
    return (data.photos ?? [])
      .map((photo): StockPhotoResult | null => {
        const urlLarge = photo.src?.large ?? photo.src?.original ?? "";
        const thumb = photo.src?.medium ?? urlLarge;
        if (!urlLarge) return null;
        return {
          id: `pexels-${photo.id ?? urlLarge}`,
          url: urlLarge,
          thumbUrl: thumb,
          provider: "pexels",
          photographer: photo.photographer,
        };
      })
      .filter((p): p is StockPhotoResult => p != null);
  } catch (err) {
    console.warn("[searchStockPhotos] Pexels failed", err);
    return [];
  }
}

async function searchPixabayPhotos(
  query: string,
  page: number,
  perPage: number
): Promise<StockPhotoResult[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return [];
  try {
    const url =
      `${PIXABAY_PHOTO_API_URL}?key=${encodeURIComponent(apiKey)}` +
      `&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical` +
      `&per_page=${perPage}&page=${Math.max(1, page)}&safesearch=true`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      hits?: Array<{
        id?: number;
        user?: string;
        largeImageURL?: string;
        webformatURL?: string;
        previewURL?: string;
      }>;
    };
    return (data.hits ?? [])
      .map((hit): StockPhotoResult | null => {
        const urlLarge = hit.largeImageURL ?? hit.webformatURL ?? "";
        const thumb = hit.previewURL ?? hit.webformatURL ?? urlLarge;
        if (!urlLarge) return null;
        return {
          id: `pixabay-${hit.id ?? urlLarge}`,
          url: urlLarge,
          thumbUrl: thumb,
          provider: "pixabay",
          photographer: hit.user,
        };
      })
      .filter((p): p is StockPhotoResult => p != null);
  } catch (err) {
    console.warn("[searchStockPhotos] Pixabay failed", err);
    return [];
  }
}

export async function searchStockPhotos(opts: {
  query: string;
  provider?: StockPhotoProvider;
  page?: number;
  perPage?: number;
}): Promise<StockPhotoResult[]> {
  const query = opts.query.trim();
  if (!query) return [];
  const page = opts.page ?? 1;
  const perPage = Math.min(Math.max(opts.perPage ?? 12, 1), 24);
  const provider = opts.provider ?? "auto";

  if (provider === "pexels") {
    return searchPexelsPhotos(query, page, perPage);
  }
  if (provider === "pixabay") {
    return searchPixabayPhotos(query, page, perPage);
  }

  const half = Math.ceil(perPage / 2);
  const [pexels, pixabay] = await Promise.all([
    searchPexelsPhotos(query, page, half),
    searchPixabayPhotos(query, page, perPage - half),
  ]);
  const merged: StockPhotoResult[] = [];
  const max = Math.max(pexels.length, pixabay.length);
  for (let i = 0; i < max; i++) {
    if (pexels[i]) merged.push(pexels[i]);
    if (pixabay[i]) merged.push(pixabay[i]);
  }
  return merged.slice(0, perPage);
}
