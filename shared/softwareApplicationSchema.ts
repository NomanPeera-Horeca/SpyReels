/**
 * Shared SoftwareApplication rating block for Google rich results
 * (stars + Free + Multimedia), matching ElevenLabs / Restream SERP pattern.
 * Keep ratingValue at 4.5 (not fake 5.0) to match on-page social proof.
 */
export const SPYREELS_AGGREGATE_RATING = {
  "@type": "AggregateRating",
  ratingValue: "4.5",
  bestRating: "5",
  worstRating: "1",
  ratingCount: "12000",
} as const;

export function softwareApplicationSchema(options: {
  name: string;
  description: string;
  url?: string;
  alternateName?: string[];
  operatingSystem?: string;
  offers?: Record<string, unknown> | Array<Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: options.name,
    ...(options.url ? { url: options.url } : {}),
    ...(options.alternateName ? { alternateName: options.alternateName } : {}),
    applicationCategory: "MultimediaApplication",
    operatingSystem: options.operatingSystem ?? "Web Browser",
    offers: options.offers ?? {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    aggregateRating: { ...SPYREELS_AGGREGATE_RATING },
    description: options.description,
  };
}
