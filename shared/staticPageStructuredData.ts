import { SPYREELS_SITE_URL } from "./publicPageMeta";

export const SPYREELS_LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

type FaqItem = { q: string; a: string };

function faqSchema(items: FaqItem[]): Record<string, unknown> {
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

function breadcrumbSchema(
  crumbs: Array<{ name: string; item: string }>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };
}

const HOME_FAQ: FaqItem[] = [
  {
    q: "How is this different from just manually scrolling Instagram?",
    a: "Manual scrolling shows you Reels in chronological order with no data. SpyReels shows you every Reel a creator has ever posted, sorted by views, likes, and engagement rate. You see their top performers instantly. Then you transcribe and recreate in minutes, not hours.",
  },
  {
    q: "Will Instagram ban my account for using this?",
    a: "No. SpyReels never accesses your Instagram account and does not require your login. We only read publicly available data that anyone can see by visiting a profile. Your account is completely safe.",
  },
  {
    q: "How fast can I actually get a script?",
    a: "Most users go from picking a creator to having a ready-to-film script in under 10 minutes. Research takes about 2 minutes, transcription takes about 1 minute, and AI script generation takes about 30 seconds.",
  },
  {
    q: "Do I need to be a big creator for this to work?",
    a: "This is built specifically for creators under 50K followers who are trying to grow. The strategy of studying what works and replicating it is exactly how most big creators built their audience in the first place.",
  },
  {
    q: "What if I don't like it after paying?",
    a: "Every paid plan comes with a 14-day money-back guarantee. Cancel any time with one click from your billing page. No contracts, no questions asked.",
  },
  {
    q: "Can I save money with annual billing?",
    a: "Yes. Annual plans save over 40%. Starter drops to $11 per month, Pro drops to $29 per month. You can switch to annual any time from your billing page.",
  },
];

const PRICING_FAQ: FaqItem[] = [
  {
    q: "Is there a free trial?",
    a: "The Free plan is your trial. You can research accounts, generate transcripts, rewrite scripts, and test the teleprompter without adding a card.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. There are no contracts or hidden fees. Cancel in one click and keep access until the end of your billing period.",
  },
  {
    q: "What is the 14-day money-back guarantee?",
    a: "If you upgrade and SpyReels does not help your workflow, email us within 14 days and we will refund your first payment.",
  },
  {
    q: "What is SpyReels Bot?",
    a: "SpyReels Bot helps you turn research and transcripts into sharper hooks, scripts, angles, and posting ideas based on what is already working in your niche.",
  },
  {
    q: "Do transcripts count against my plan?",
    a: "Yes. Each Reel transcription uses one transcript credit. Your limits reset every billing cycle.",
  },
  {
    q: "Do I need Instagram login access?",
    a: "No. SpyReels analyzes publicly available Reels and does not require your Instagram password.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade, downgrade, or move from monthly to annual from billing. Your saved scripts and research stay in your account.",
  },
  {
    q: "Which plan should I pick?",
    a: "Start with Solo Creator if you post a few times a week. Pick Pro if you want the full research, transcript, Bot, script, and teleprompter workflow with enough volume to post daily.",
  },
];

const FINDER_FAQ: FaqItem[] = [
  {
    q: "What is a viral reel finder?",
    a: "A viral reel finder is a tool that shows you which Instagram Reels are performing best in a niche or on a specific account. SpyReels ranks Reels by views and engagement, then adds transcripts so you can study hooks and structure instead of guessing from the feed.",
  },
  {
    q: "How is SpyReels different from manual Instagram search?",
    a: "Manual search means scrolling hashtags and profiles for hours with no sorting or transcripts. SpyReels gives you a sorted list of top performers for any public handle in minutes, plus Deepgram-powered transcription and script tools so research turns into content you can film.",
  },
  {
    q: "Can I find viral Reels from any creator?",
    a: "Yes, as long as the Instagram account is public. Enter a handle, review their highest-performing Reels, and save the ones worth studying. You can compare multiple creators in your niche over time without rebuilding spreadsheets by hand.",
  },
  {
    q: "Does SpyReels transcribe the Reels it finds?",
    a: "Yes. SpyReels transcribes audio using Deepgram so you get full spoken scripts, not just captions. That makes it easier to see how hooks open, how stories transition, and what language patterns repeat in winners.",
  },
  {
    q: "How much does the SpyReels viral reel finder cost?",
    a: "You can start on the free tier with no credit card. Paid plans unlock more research sessions, transcriptions, and AI script generation. See current pricing on the SpyReels pricing page for limits on each plan.",
  },
  {
    q: "What types of creators is SpyReels built for?",
    a: "SpyReels is built for nano and micro Instagram creators under 50,000 followers who need leverage without a full research team. Coaches, educators, local businesses, and personal brands use it to study what works before they record.",
  },
  {
    q: "Can I generate scripts based on the viral Reels I find?",
    a: "Yes. After you find and transcribe a winning Reel, SpyReels can help you generate a new script based on the same structure while keeping your voice. Use the editor and teleprompter to go from research to filming in one workflow.",
  },
];

const HOOKS_FAQ: FaqItem[] = [
  {
    q: "Is this really free?",
    a: "Yes. You get a preview of generated hooks with no signup. To unlock the full set, we ask for your email to send them to you. No credit card, no subscription required.",
  },
  {
    q: "Do I need to sign up for SpyReels?",
    a: "No signup needed to use the hook generator. If you want to find viral Reels in your niche, transcribe them, or generate full scripts, that is the SpyReels product. The hook generator is a free standalone tool.",
  },
  {
    q: "How accurate are these hooks?",
    a: "Our AI is trained on viral Instagram Reels patterns. It cannot guarantee that any specific hook will go viral, but it generates options that follow proven structures used by creators who consistently get high views. You should adapt and test.",
  },
  {
    q: "Can I use these hooks on TikTok or YouTube Shorts?",
    a: "Yes. The hook patterns work across all short-form video platforms because they are based on attention psychology, not platform-specific tricks. Optimize the delivery for each platform.",
  },
  {
    q: "What makes SpyReels' hook generator different from Copy.ai or Ahrefs?",
    a: "Most hook generators give generic AI output. We focus specifically on Instagram Reels for nano and micro creators. The hook patterns are tuned for vertical video and short attention spans. We also let you specify your target audience so the hooks fit your actual viewer.",
  },
];

const AFFILIATE_FAQ: FaqItem[] = [
  {
    q: "How and when do I get paid?",
    a: "Payments go out monthly via PayPal or Wise once your balance crosses the $50 minimum. Each cycle covers commissions confirmed in the prior month.",
  },
  {
    q: "What counts as a qualified referral?",
    a: "Any new paid subscriber who signs up through your unique link within 60 days of their first click. Self referrals and refunded customers do not count.",
  },
  {
    q: "What is the 60-day cookie window?",
    a: "If someone clicks your link, our tracking remembers them for 60 days. They can come back later, sign up, and you still get credit for the conversion.",
  },
  {
    q: "Do recurring commissions stop if my referral upgrades or downgrades?",
    a: "No. You earn your commission rate on whatever they pay each month for the full 12 month window, whether that is Starter, Pro, or Business.",
  },
  {
    q: "What if my audience signs up for the free plan?",
    a: "You get credit the moment they upgrade to any paid plan, as long as it happens inside the 60 day cookie window.",
  },
  {
    q: "Can I run paid ads on the SpyReels brand name?",
    a: "No bidding on SpyReels or close variants in Google, Meta, or TikTok ads. Paid ads using your own creatives on your own audiences are fine.",
  },
  {
    q: "Will custom promo codes affect my commission?",
    a: "Custom promo codes are reserved for Platinum partners. When activated, they apply a small discount for your audience and do not reduce your commission rate.",
  },
  {
    q: "How fast does the application get reviewed?",
    a: "Most approvals happen inside 24 hours. We manually review every application, so very off fit applicants may be declined or asked for more context.",
  },
];

export type StaticPageJsonLdScript = {
  id: string;
  data: Record<string, unknown>;
};

/** Crawler-visible JSON-LD for key marketing pages (matches client-side schema ids). */
export function getStaticPageJsonLdScripts(pathname: string): StaticPageJsonLdScript[] {
  switch (pathname) {
    case "/":
      return [
        {
          id: "home-organization-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SpyReels",
            url: SPYREELS_SITE_URL,
            logo: SPYREELS_LOGO_URL,
            sameAs: [],
          },
        },
        {
          id: "home-website-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "SpyReels",
            url: SPYREELS_SITE_URL,
            potentialAction: {
              "@type": "SearchAction",
              target: `${SPYREELS_SITE_URL}/blog?q={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          },
        },
        {
          id: "home-software-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SpyReels",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web Browser",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
              description: "Free tier available",
            },
            description:
              "Instagram Reels spy tool with analytics, transcription, and AI script generation for nano and micro creators.",
          },
        },
        {
          id: "home-faq-schema",
          data: faqSchema(HOME_FAQ),
        },
      ];
    case "/pricing":
      return [
        {
          id: "pricing-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            { name: "Pricing", item: `${SPYREELS_SITE_URL}/pricing` },
          ]),
        },
        {
          id: "pricing-product-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "Product",
            name: "SpyReels",
            description: "AI-powered Instagram Reels analytics and script generation",
            brand: {
              "@type": "Brand",
              name: "SpyReels",
            },
            offers: {
              "@type": "AggregateOffer",
              lowPrice: "0",
              highPrice: "99",
              priceCurrency: "USD",
              offerCount: "4",
              offers: [
                { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
                { "@type": "Offer", name: "Starter", price: "19", priceCurrency: "USD" },
                { "@type": "Offer", name: "Pro", price: "49", priceCurrency: "USD" },
                { "@type": "Offer", name: "Business", price: "99", priceCurrency: "USD" },
              ],
            },
          },
        },
        {
          id: "pricing-faq-schema",
          data: faqSchema(PRICING_FAQ),
        },
      ];
    case "/features/viral-reel-finder":
      return [
        {
          id: "finder-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            {
              name: "Features",
              item: `${SPYREELS_SITE_URL}/features/viral-reel-finder`,
            },
            {
              name: "Viral Reel Finder",
              item: `${SPYREELS_SITE_URL}/features/viral-reel-finder`,
            },
          ]),
        },
        {
          id: "finder-software-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SpyReels Viral Reel Finder",
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Web Browser",
            offers: {
              "@type": "AggregateOffer",
              lowPrice: "0",
              highPrice: "99",
              priceCurrency: "USD",
            },
            description:
              "AI-powered viral Instagram Reel finder for nano and micro creators. Surfaces viral content by view count and engagement, then transcribes and generates scripts.",
          },
        },
        {
          id: "finder-faq-schema",
          data: faqSchema(FINDER_FAQ),
        },
      ];
    case "/free-tools/viral-hooks":
      return [
        {
          id: "hooks-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            { name: "Free Tools", item: `${SPYREELS_SITE_URL}/free-tools` },
            {
              name: "Viral Hook Generator",
              item: `${SPYREELS_SITE_URL}/free-tools/viral-hooks`,
            },
          ]),
        },
        {
          id: "hooks-software-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Free Instagram Viral Hook Generator",
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Web Browser",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            description:
              "Free tool that generates viral Instagram Reels hooks tailored to your niche and audience using AI.",
          },
        },
        {
          id: "hooks-faq-schema",
          data: faqSchema(HOOKS_FAQ),
        },
      ];
    case "/affiliate":
      return [
        {
          id: "affiliate-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            { name: "Affiliate", item: `${SPYREELS_SITE_URL}/affiliate` },
          ]),
        },
        {
          id: "affiliate-faq-schema",
          data: faqSchema(AFFILIATE_FAQ),
        },
      ];
    default:
      return [];
  }
}

export const STATIC_PAGE_JSON_LD_PATHS = [
  "/",
  "/pricing",
  "/features/viral-reel-finder",
  "/free-tools/viral-hooks",
  "/affiliate",
] as const;
