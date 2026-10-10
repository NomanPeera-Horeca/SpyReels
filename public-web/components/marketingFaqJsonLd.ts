/** Shared FAQPage JSON-LD builder. Visible FAQ + schema must use the same items. */

export type MarketingFaqItem = {
  q: string;
  a: string;
  afterLink?: { href: string; label: string };
};

export function buildFaqPageJsonLd(items: readonly MarketingFaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
