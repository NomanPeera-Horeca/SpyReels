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
    a: "Most users go from niche setup to a ready-to-film script in under 10 minutes. Research takes about 2 minutes, your 30-day plan fills in ideas, and AI Personal Brand Coach writes the script in about 30 seconds.",
  },
  {
    q: "What is AI Personal Brand Coach?",
    a: "AI Personal Brand Coach is SpyReels script studio. It writes viral Reel scripts in your voice using niche-aware prompts, plan cards, and proven HEIT structure. Brand Coach on Pro plans is different: it scores how viral an existing Reel is.",
  },
  {
    q: "Do I need to be a big creator for this to work?",
    a: "This is built for creators who are trying to grow. The strategy of studying what works and replicating it is exactly how most big creators built their audience in the first place.",
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
    a: "You can start on the free tier. Paid plans unlock more research sessions, transcriptions, and AI script generation. See current pricing on the SpyReels pricing page for limits on each plan.",
  },
  {
    q: "What types of creators is SpyReels built for?",
    a: "SpyReels is built for Instagram creators who need leverage without a full research team. Coaches, educators, local businesses, and personal brands use it to study what works before they record.",
  },
  {
    q: "Can I generate scripts based on the viral Reels I find?",
    a: "Yes. After you find and transcribe a winning Reel, SpyReels can help you generate a new script based on the same structure while keeping your voice. Use the editor and teleprompter to go from research to filming in one workflow.",
  },
];

const TIKTOK_FINDER_FAQ: FaqItem[] = [
  {
    q: "What is the best free TikTok finder?",
    a: "It depends on the job. Keyword libraries are best for browsing trends by topic. SpyReels is the free TikTok finder for the by-username job: paste a public handle, sort viral TikTok videos by outlier score, then remake winners in your voice. Start free.",
  },
  {
    q: "How do I find viral TikTok videos on a profile?",
    a: "Open a TikTok finder that supports username search, paste the handle, and sort by outlier score or views. Native TikTok only shows recent posts in order, so the best videos stay buried. SpyReels surfaces them first.",
  },
  {
    q: "Is there a TikTok video finder by username?",
    a: "Yes. SpyReels is built for that. Paste @username or a profile link. We do not claim to reverse-search by image or recover deleted TikToks.",
  },
  {
    q: "How do I find viral TikToks for free?",
    a: "Use a free TikTok viral video finder, spy 3 peer accounts, sort by outlier score, and read the hooks on the top five. The shared pattern is what you remake, not the exact video.",
  },
  {
    q: "How to go viral on TikTok without guessing?",
    a: "Research first. Find viral TikTok videos from accounts like yours, copy the structure (hook, pacing, payoff), change the story to your niche, and post consistently. SpyReels turns that research into a script you can film the same day.",
  },
  {
    q: "Can I paste a TikTok profile link?",
    a: "Yes. Paste a public profile URL or @username. Private accounts cannot be researched.",
  },
  {
    q: "Is this the same as searching millions of TikToks by keyword?",
    a: "No. That is a different product. SpyReels spies one creator at a time and ranks their catalogue. If you only need a keyword mood search across a giant library, use a keyword library tool.",
  },
  {
    q: "Can I use findings for Reels and YouTube Shorts too?",
    a: "Yes. Formats that win on TikTok often travel. Remake the script once, then adapt the cut for Reels or Shorts. SpyReels also has an Instagram Viral Reel Finder.",
  },
];

const YOUTUBE_SHORTS_FINDER_FAQ: FaqItem[] = [
  {
    q: "What is the best free YouTube Shorts finder?",
    a: "It depends on the job. Keyword libraries are best for browsing trends by topic. SpyReels is the free YouTube Shorts finder for the by-channel job: paste a public handle, sort viral Shorts by outlier score, then remake winners in your voice. Start free.",
  },
  {
    q: "How do I find viral YouTube Shorts on a channel?",
    a: "Open a Shorts finder that supports username or channel search, paste the handle, and sort by outlier score or views. Native YouTube mostly shows recent uploads, so the best Shorts stay buried. SpyReels surfaces them first.",
  },
  {
    q: "Is there a YouTube Shorts finder by username?",
    a: "Yes. SpyReels is built for that. Paste @username or a channel URL. Private or unlisted content cannot be researched.",
  },
  {
    q: "How do I find viral YouTube Shorts for free?",
    a: "Use a free YouTube Shorts viral finder, spy 3 peer channels, sort by outlier score, and read the hooks on the top five. The shared pattern is what you remake, not the exact video.",
  },
  {
    q: "How to go viral on YouTube Shorts without guessing?",
    a: "Research first. Find viral Shorts from channels like yours, copy the structure (hook, pacing, payoff), change the story to your niche, and post consistently. SpyReels turns that research into a script you can film the same day.",
  },
  {
    q: "Can I paste a YouTube channel link?",
    a: "Yes. Paste a public channel URL or @username. Private channels cannot be researched.",
  },
  {
    q: "Is this the same as searching millions of Shorts by keyword?",
    a: "No. That is a different product. SpyReels spies one creator at a time and ranks their catalogue. If you only need a keyword search across a giant library, use a keyword library tool.",
  },
  {
    q: "Can I use findings for TikTok and Instagram Reels too?",
    a: "Yes. Formats that win on Shorts often travel. Remake the script once, then adapt the cut for TikTok or Reels. SpyReels also has a TikTok Viral Video Finder and an Instagram Viral Reel Finder.",
  },
];

const FREE_TOOLS_HUB_FAQ: FaqItem[] = [
  {
    q: "What free tools does SpyReels offer?",
    a: "SpyReels Free Tools includes a viral hook generator, AI B-roll generator, TikTok viral video finder, YouTube Shorts viral finder, Instagram viral Reel finder, and an AI script generator. Start free and move from research to a remake in one place.",
  },
  {
    q: "Do I need a SpyReels account to try these tools?",
    a: "Most tools let you preview free without a paid plan. Some flows ask you to sign up to unlock the full result or save your work. You can start free.",
  },
  {
    q: "Are these tools only for Instagram?",
    a: "No. The hub covers Instagram Reels, TikTok, and YouTube Shorts. Formats that win on one platform often travel, so you can research once and adapt the remake.",
  },
  {
    q: "What is a viral finder by username?",
    a: "A username finder spies one public creator at a time and ranks their videos by views, engagement, and outlier score versus that account's own median. That is different from keyword libraries that browse millions of clips by topic.",
  },
  {
    q: "How do I go viral without guessing?",
    a: "Find what already works on peer accounts, remake the structure in your voice, and post consistently. SpyReels connects research, hooks, B-roll, and scripts so you spend less time scrolling and more time filming.",
  },
];

const HOOKS_FAQ: FaqItem[] = [
  {
    q: "What is a viral hook generator?",
    a: "It is an AI tool that writes scroll-stopping opening lines for short videos. SpyReels focuses on spoken hooks plus on-screen text for Reels, TikTok, and Shorts.",
  },
  {
    q: "Can I try the viral hook generator without paying?",
    a: "Yes. You can generate hooks and see results before you start a SpyReels plan.",
  },
  {
    q: "How do I create a hook for Instagram Reels or TikTok?",
    a: "State the promise or curiosity gap in the first 1 to 2 seconds, match on-screen text to the spoken line, then deliver on the promise in the body.",
  },
  {
    q: "What makes a good short-form video hook?",
    a: "Specificity, emotion, and an open loop. Vague intros get scrolled. Concrete claims and pattern interrupts keep viewers.",
  },
  {
    q: "How is SpyReels different from Copy.ai or ChatGPT?",
    a: "ChatGPT, Claude, and tools like Copy.ai write generic openings from general knowledge. SpyReels is trained on millions of viral videos and hooks, so every line is shaped by patterns that already stopped the scroll. That is why the result feels different from what a general AI chat tool can produce.",
  },
];

const BROLL_FAQ: FaqItem[] = [
  {
    q: "What is B-roll?",
    a: "B-roll is the extra footage that plays while you're talking or narrating, things like close-ups, scenery, or clips of what you're describing. It's what makes a video feel put-together instead of just one person talking at the camera the whole time.",
  },
  {
    q: "Why do videos need B-roll?",
    a: "Watching one shot for too long gets boring fast, most people stop paying attention within a few seconds. B-roll breaks that up by giving the viewer something new to look at every few seconds, which keeps them watching longer.",
  },
  {
    q: "What's the difference between AI-generated and real footage B-roll?",
    a: "Real footage B-roll comes from actual video, filmed by someone. AI-generated B-roll is created from scratch by AI based on a description. Both can work, real footage tends to look more natural, AI-generated is useful when no real clip fits.",
  },
  {
    q: "Can I plan my B-roll before I film anything?",
    a: "Yes. If you paste in a script, SpyReels finds matching footage for it before you've recorded a single second, so you know exactly what shots you need going into filming.",
  },
  {
    q: "Is the B-roll generator free?",
    a: "Yes. You can paste a script or upload a video and generate a watermarked preview with no account and no credit card. Signing up (also free) removes the watermark and saves your project. You only pay when you download the full-resolution file.",
  },
  {
    q: "Do I need to sign up to try it?",
    a: "No. Generating a preview works with no login. You'll only be asked to sign up if you want to save your project or remove the watermark, and to pay only when you're ready to download the final file.",
  },
  {
    q: "Do I need to upload a video, or can I just paste a script?",
    a: "Either works. Paste a script to get B-roll matched before you film, or upload a video you've already recorded and SpyReels will transcribe it and match B-roll to your existing footage.",
  },
  {
    q: "Where does the AI-generated B-roll come from?",
    a: "SpyReels matches your script or transcript to real stock footage, or generates an original AI video clip when no strong stock match exists.",
  },
  {
    q: "Can I use this for YouTube Shorts or TikTok?",
    a: "Yes. The generator supports vertical, horizontal, and square output so clips fit Reels, Shorts, TikTok, and standard YouTube without manual reformatting.",
  },
  {
    q: "What is different about the free preview?",
    a: "Free previews include a SpyReels watermark overlay so you can judge the match quality before paying. Downloads after payment are watermark-free. There is no resolution or duration cap on the free preview.",
  },
  {
    q: "Does the free preview expire or get deleted?",
    a: "Previews generated without an account are session-based and not saved. Sign up free to keep your project and come back to it later.",
  },
  {
    q: "Do I need video editing experience?",
    a: "No. The AI handles beat detection and clip matching automatically. You review the result and download, no timeline editing required.",
  },
  {
    q: "What video formats can I upload?",
    a: "MP4 and MOV are supported for the video-upload mode. Uploaded audio is automatically transcribed to detect beats.",
  },
  {
    q: "How is this different from just searching for stock footage myself?",
    a: "SpyReels reads your full script or transcript, breaks it into the specific visual beats that need footage, and searches and places multiple matched clips automatically instead of manually reading each line and searching stock libraries one keyword at a time.",
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
              "Instagram Reels spy tool with analytics, transcription, and AI script generation for creators.",
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
              "AI-powered viral Instagram Reel finder for creators. Surfaces viral content by view count and engagement, then transcribes and generates scripts.",
          },
        },
        {
          id: "finder-faq-schema",
          data: faqSchema(FINDER_FAQ),
        },
      ];
    case "/free-tools/tiktok-viral-video-finder":
      return [
        {
          id: "tt-finder-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            {
              name: "Free Tools",
              item: `${SPYREELS_SITE_URL}/free-tools`,
            },
            {
              name: "TikTok Finder",
              item: `${SPYREELS_SITE_URL}/free-tools/tiktok-viral-video-finder`,
            },
          ]),
        },
        {
          id: "tt-finder-software-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SpyReels TikTok Finder",
            alternateName: [
              "TikTok Finder",
              "TikTok Viral Video Finder",
              "TikTok Video Finder",
            ],
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Web Browser",
            offers: {
              "@type": "AggregateOffer",
              lowPrice: "0",
              highPrice: "99",
              priceCurrency: "USD",
            },
            description:
              "Free TikTok finder by username. Sort viral TikTok videos by views, engagement and outlier score, then remake winners in your voice.",
          },
        },
        {
          id: "tt-finder-faq-schema",
          data: faqSchema(TIKTOK_FINDER_FAQ),
        },
      ];
    case "/free-tools/youtube-shorts-viral-finder":
      return [
        {
          id: "yt-finder-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            {
              name: "Free Tools",
              item: `${SPYREELS_SITE_URL}/free-tools`,
            },
            {
              name: "YouTube Shorts Finder",
              item: `${SPYREELS_SITE_URL}/free-tools/youtube-shorts-viral-finder`,
            },
          ]),
        },
        {
          id: "yt-finder-software-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SpyReels YouTube Shorts Finder",
            alternateName: [
              "YouTube Shorts Finder",
              "YouTube Shorts Viral Finder",
              "YouTube Short Finder",
            ],
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Web Browser",
            offers: {
              "@type": "AggregateOffer",
              lowPrice: "0",
              highPrice: "99",
              priceCurrency: "USD",
            },
            description:
              "Free YouTube Shorts finder by channel. Sort viral Shorts by views, engagement and outlier score, then remake winners in your voice.",
          },
        },
        {
          id: "yt-finder-faq-schema",
          data: faqSchema(YOUTUBE_SHORTS_FINDER_FAQ),
        },
      ];
    case "/features/30-day-content-plan":
      return [
        {
          id: "plan-feature-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            {
              name: "Features",
              item: `${SPYREELS_SITE_URL}/features/30-day-content-plan`,
            },
            {
              name: "30-Day Content Plan",
              item: `${SPYREELS_SITE_URL}/features/30-day-content-plan`,
            },
          ]),
        },
        {
          id: "plan-feature-software-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SpyReels 30-Day Content Plan",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web Browser",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            description:
              "30-day Instagram Reels content calendar with Spark Deck and AI script writing.",
          },
        },
      ];
    case "/features/ai-personal-brand-coach":
      return [
        {
          id: "coach-feature-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            {
              name: "Features",
              item: `${SPYREELS_SITE_URL}/features/ai-personal-brand-coach`,
            },
            {
              name: "AI Personal Brand Coach",
              item: `${SPYREELS_SITE_URL}/features/ai-personal-brand-coach`,
            },
          ]),
        },
        {
          id: "coach-feature-software-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SpyReels AI Personal Brand Coach",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web Browser",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            description:
              "AI script studio for Instagram Reels with niche-aware prompts and HEIT structure.",
          },
        },
      ];
    case "/free-tools":
      return [
        {
          id: "free-tools-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            { name: "Free Tools", item: `${SPYREELS_SITE_URL}/free-tools` },
          ]),
        },
        {
          id: "free-tools-itemlist-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "SpyReels Free Tools",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Instagram Viral Hook Generator",
                url: `${SPYREELS_SITE_URL}/free-tools/viral-hooks`,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "AI B-Roll Generator",
                url: `${SPYREELS_SITE_URL}/free-tools/broll-generator`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: "TikTok Viral Video Finder",
                url: `${SPYREELS_SITE_URL}/free-tools/tiktok-viral-video-finder`,
              },
              {
                "@type": "ListItem",
                position: 4,
                name: "YouTube Shorts Viral Finder",
                url: `${SPYREELS_SITE_URL}/free-tools/youtube-shorts-viral-finder`,
              },
              {
                "@type": "ListItem",
                position: 5,
                name: "Instagram Viral Reel Finder",
                url: `${SPYREELS_SITE_URL}/features/viral-reel-finder`,
              },
              {
                "@type": "ListItem",
                position: 6,
                name: "AI Script Generator",
                url: `${SPYREELS_SITE_URL}/features/ai-personal-brand-coach`,
              },
            ],
          },
        },
        {
          id: "free-tools-faq-schema",
          data: faqSchema(FREE_TOOLS_HUB_FAQ),
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
            name: "Viral Hook Generator",
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Web Browser",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            description:
              "Free AI viral hook generator for Reels, TikTok, and Shorts. Spoken lines plus on-screen text from proven patterns.",
          },
        },
        {
          id: "hooks-faq-schema",
          data: faqSchema(HOOKS_FAQ),
        },
      ];
    case "/free-tools/broll-generator":
      return [
        {
          id: "broll-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            { name: "Free Tools", item: `${SPYREELS_SITE_URL}/free-tools` },
            {
              name: "Free AI B-Roll Generator",
              item: `${SPYREELS_SITE_URL}/free-tools/broll-generator`,
            },
          ]),
        },
        {
          id: "broll-software-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Free AI B-Roll Generator",
            url: `${SPYREELS_SITE_URL}/free-tools/broll-generator`,
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Web",
            description:
              "Paste your script, or upload footage you've already shot. SpyReels matches every beat to real footage automatically and turns it into a fully B-rolled video. Free preview requires no signup; signup unlocks saving and watermark removal; payment unlocks full-resolution download.",
            offers: [
              {
                "@type": "Offer",
                name: "Free Preview",
                price: "0",
                priceCurrency: "USD",
                description:
                  "Generate a watermarked preview with no signup required. Full resolution, no duration cap.",
              },
              {
                "@type": "Offer",
                name: "Full Download",
                priceCurrency: "USD",
                description:
                  "Full-resolution, watermark-free download after account signup and payment.",
              },
            ],
          },
        },
        {
          id: "broll-faq-schema",
          data: faqSchema(BROLL_FAQ),
        },
        {
          id: "broll-howto-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: "How to generate B-roll with SpyReels",
            description:
              "Paste your script, or upload footage you've already shot. SpyReels matches every beat to real footage automatically using the free AI B-roll generator.",
            step: [
              {
                "@type": "HowToStep",
                name: "Paste your script or upload your video",
                text: "Drop in a script you've written, or upload a talking-head video you've already filmed.",
              },
              {
                "@type": "HowToStep",
                name: "AI splits it into visual beats",
                text: "SpyReels reads your script or transcript and breaks it into the specific moments that need a visual, in a single AI pass.",
              },
              {
                "@type": "HowToStep",
                name: "Each beat gets matched B-roll",
                text: "Every beat is matched to real stock footage or an original AI-generated clip, picked for the exact words being said.",
              },
              {
                "@type": "HowToStep",
                name: "Preview instantly, download when ready",
                text: "Watch your watermarked preview immediately with no account. Sign up free to save your project and remove the watermark. Pay only to download full-resolution files.",
              },
            ],
          },
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
    case "/about":
      return [
        {
          id: "about-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            { name: "About", item: `${SPYREELS_SITE_URL}/about` },
          ]),
        },
        {
          id: "about-person-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "Person",
            name: "Noah Perry",
            url: `${SPYREELS_SITE_URL}/about`,
            jobTitle: "Founder",
            worksFor: {
              "@type": "Organization",
              name: "SpyReels",
            },
          },
        },
        {
          id: "about-organization-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SpyReels",
            url: SPYREELS_SITE_URL,
            logo: SPYREELS_LOGO_URL,
            sameAs: [],
          },
        },
      ];
    case "/contact":
      return [
        {
          id: "contact-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            { name: "Contact", item: `${SPYREELS_SITE_URL}/contact` },
          ]),
        },
        {
          id: "contact-organization-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SpyReels",
            url: SPYREELS_SITE_URL,
            contactPoint: {
              "@type": "ContactPoint",
              contactType: "customer support",
              email: "noah.perry@spyreels.ai",
              availableLanguage: "English",
            },
          },
        },
      ];
    case "/extension":
      return [
        {
          id: "extension-breadcrumb-schema",
          data: breadcrumbSchema([
            { name: "Home", item: `${SPYREELS_SITE_URL}/` },
            { name: "Chrome Extension", item: `${SPYREELS_SITE_URL}/extension` },
          ]),
        },
        {
          id: "extension-software-schema",
          data: {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SpyReels Chrome Extension for Instagram Reels",
            applicationCategory: "BrowserApplication",
            operatingSystem: "Chrome",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            description:
              "Chrome extension to sort Instagram Reels by views and engagement, transcribe hooks, and save winners to your SpyReels dashboard.",
          },
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
  "/free-tools",
  "/free-tools/tiktok-viral-video-finder",
  "/free-tools/youtube-shorts-viral-finder",
  "/features/30-day-content-plan",
  "/features/ai-personal-brand-coach",
  "/free-tools/viral-hooks",
  "/free-tools/broll-generator",
  "/affiliate",
  "/about",
  "/contact",
  "/extension",
] as const;
