export type ScriptGeneratorVariant = "hub" | "tiktok" | "instagram";

export type ScriptGeneratorCopy = {
  variant: ScriptGeneratorVariant;
  path: string;
  breadcrumbLabel: string;
  h1Before: string;
  h1Em: string;
  h1After: string;
  sub: string;
  answer: string;
  toolHead: string;
  ctaLabel: string;
  platformLocked: string | null;
  platformOptions: string[];
  defaultPlatform: string;
  metaTitle: string;
  metaDescription: string;
  schemaName: string;
  faq: Array<{ q: string; a: string }>;
  bridgeHeadline: string;
  bridgeEm: string;
  finalHeadline: string;
};

const SHARED_FAQ_TAIL: Array<{ q: string; a: string }> = [
  {
    q: "Do I only get dialogue, or more?",
    a: "You get the spoken HEIT script plus filming notes, post caption, and music mood. That is the SpyReels wedge versus tools that only dump lines.",
  },
  {
    q: "Is this free to try?",
    a: "Yes. You can generate a preview free. Create a free account to unlock the full script pack and film in Studio.",
  },
  {
    q: "How is this different from ChatGPT?",
    a: "ChatGPT writes general text. SpyReels returns filming notes, caption, and music direction with the script, then connects to Studio, teleprompter, and viral remake research.",
  },
  {
    q: "What is HEIT structure?",
    a: "Hook, Engagement bridge, Insight or story, Takeaway with CTA. It is the SpyReels framework for retention-first short-form scripts.",
  },
];

export const SCRIPT_GENERATOR_COPY: Record<ScriptGeneratorVariant, ScriptGeneratorCopy> = {
  hub: {
    variant: "hub",
    path: "/free-tools/ai-script-generator",
    breadcrumbLabel: "AI Script Generator",
    h1Before: "AI ",
    h1Em: "Script Generator",
    h1After: "",
    sub: "Get the spoken script, filming notes, caption, and music direction in one pack.",
    answer:
      "An AI script generator turns your topic into a ready-to-film short-form pack: HEIT spoken script, production and filming notes, on-screen caption, and music mood. SpyReels shapes output from viral patterns, then opens Studio with teleprompter so you shoot, not just draft.",
    toolHead: "AI Script Generator",
    ctaLabel: "Generate Viral Script",
    platformLocked: null,
    platformOptions: ["Instagram Reels", "TikTok", "YouTube Shorts", "Any short-form"],
    defaultPlatform: "Instagram Reels",
    metaTitle: "Free AI Script Generator for Reels, TikTok & Shorts | SpyReels",
    metaDescription:
      "Free AI script generator for Reels, TikTok, and Shorts. Get spoken script, filming notes, caption, and music direction. Start free with SpyReels.",
    schemaName: "AI Script Generator",
    faq: [
      {
        q: "What is an AI script generator?",
        a: "It turns a topic into a full short-form video pack: spoken script, filming notes, caption, and music direction. SpyReels focuses on Reels, TikTok, and Shorts with HEIT structure.",
      },
      ...SHARED_FAQ_TAIL,
      {
        q: "Should I use the TikTok or Instagram page instead?",
        a: "Use this hub for platform-agnostic searches like AI script generator. Use the TikTok or Instagram Reels pages when that is the exact query. Same engine; different primary keyword.",
      },
      {
        q: "How is this different from a transcript tool?",
        a: "Transcript tools turn an existing video into text. This generator writes a new script pack from your idea.",
      },
    ],
    bridgeHeadline: "You've got the ",
    bridgeEm: "script",
    finalHeadline: "Your next viral script starts here",
  },
  tiktok: {
    variant: "tiktok",
    path: "/free-tools/tiktok-script-generator",
    breadcrumbLabel: "AI TikTok Script Generator",
    h1Before: "AI ",
    h1Em: "TikTok Script",
    h1After: " Generator",
    sub: "Generate a TikTok script with filming notes, caption, and music direction.",
    answer:
      "An AI TikTok script generator writes a ready-to-film TikTok pack from your topic: spoken HEIT script, production and filming notes, on-screen caption, and music mood. SpyReels shapes output from viral short-form patterns, then opens Studio with teleprompter so you shoot today.",
    toolHead: "AI TikTok Script Generator",
    ctaLabel: "Generate TikTok Script",
    platformLocked: "TikTok",
    platformOptions: ["TikTok"],
    defaultPlatform: "TikTok",
    metaTitle: "Free AI TikTok Script Generator | SpyReels",
    metaDescription:
      "Free AI TikTok script generator with filming notes, caption, and music direction. Write viral TikTok scripts and film in SpyReels Studio. Start free.",
    schemaName: "AI TikTok Script Generator",
    faq: [
      {
        q: "What is an AI TikTok script generator?",
        a: "It turns a topic into a TikTok-ready pack: spoken script, filming notes, caption, and music mood shaped for short-form retention.",
      },
      ...SHARED_FAQ_TAIL,
      {
        q: "How is this different from a TikTok transcript tool?",
        a: "Transcript tools convert an existing TikTok into text. This page writes a new TikTok script from your idea.",
      },
    ],
    bridgeHeadline: "You've got the ",
    bridgeEm: "TikTok script",
    finalHeadline: "Your next TikTok script starts here",
  },
  instagram: {
    variant: "instagram",
    path: "/free-tools/instagram-reels-script-generator",
    breadcrumbLabel: "Instagram Reels Script Generator",
    h1Before: "Instagram ",
    h1Em: "Reels Script",
    h1After: " Generator",
    sub: "Script for Instagram Reels with filming notes, caption, and music. Ready to shoot, not just draft.",
    answer:
      "An Instagram Reels script generator turns your topic into a ready-to-film Reel pack: spoken HEIT script, production and filming notes, caption, and music mood. SpyReels shapes output from viral Reel patterns, then opens Studio with teleprompter.",
    toolHead: "Instagram Reels Script Generator",
    ctaLabel: "Generate Instagram Script",
    platformLocked: "Instagram Reels",
    platformOptions: ["Instagram Reels"],
    defaultPlatform: "Instagram Reels",
    metaTitle: "Free Instagram Reels Script Generator | SpyReels",
    metaDescription:
      "Free Instagram Reels script generator with filming notes, caption, and music. Write a Reel script and shoot in SpyReels Studio. Start free.",
    schemaName: "Instagram Reels Script Generator",
    faq: [
      {
        q: "What is an Instagram Reels script generator?",
        a: "It turns a topic into a Reel-ready pack: spoken script, filming notes, caption, and music mood built for Instagram retention and saves.",
      },
      ...SHARED_FAQ_TAIL,
      {
        q: "How is this different from the blog guide?",
        a: "The blog guide teaches how to use a script generator. This page is the free tool that generates the script pack.",
      },
    ],
    bridgeHeadline: "You've got the ",
    bridgeEm: "Instagram script",
    finalHeadline: "Your next Instagram script starts here",
  },
};

export const SCRIPT_TONES = ["Direct", "Storyteller", "Energetic", "Calm", "Witty"] as const;

export const SCRIPT_LENGTHS = [
  "15 to 30 seconds",
  "30 to 45 seconds",
  "45 to 60 seconds",
] as const;

export type ScriptPackBeat = {
  tag: string;
  spoken: string;
  note: string;
  locked: boolean;
};

export type ScriptPack = {
  meta: string[];
  beats: ScriptPackBeat[];
  filming: Array<{ k: string; v: string }>;
  caption: string;
  music: Array<{ k: string; v: string }>;
};

export function buildDemoScriptPack(
  topic: string,
  platform: string,
  length: string,
  tone: string
): ScriptPack {
  const short = topic.trim().replace(/\s+/g, " ").slice(0, 72);
  const isTikTok = /tiktok/i.test(platform);
  const isReel = /reel|instagram/i.test(platform);
  const label = isTikTok ? "TikTok" : isReel ? "Reel" : "short video";

  return {
    meta: [platform, length, `${tone} tone`],
    beats: [
      {
        tag: "Hook",
        spoken: `Stop scrolling if you still write ${label}s from a blank page.`,
        note: "On-screen: STOP writing blank. Close-up, eye contact.",
        locked: false,
      },
      {
        tag: "Engagement",
        spoken:
          "I used to overthink every line until I stole the structure from winners in my niche.",
        note: "Cutaway: phone scroll → SpyReels finder screenshot.",
        locked: false,
      },
      {
        tag: "Insight",
        spoken: `Here is the move for “${short}”: open with a hard claim, prove it in one story beat, then give one action.`,
        note: "Talking head + 1 B-roll insert mid-beat.",
        locked: true,
      },
      {
        tag: "Takeaway + CTA",
        spoken: `Save this, generate your ${label} script, then shoot one offer video before you post tips again.`,
        note: "End card: Start free · SpyReels Studio",
        locked: true,
      },
    ],
    filming: [
      { k: "Setup", v: "Chest-up talking head, soft front light, clean background." },
      { k: "B-roll", v: "Phone scroll, calendar, client DM screenshot (blurred)." },
      { k: "Delivery", v: "Punch the hook. Pause 0.5s after the claim. Smile on CTA." },
      { k: "Cut points", v: "Hard cut every 2 to 4 seconds after the open." },
    ],
    caption: isTikTok
      ? "Still writing TikToks from a blank page? Steal the structure winners already proved. Save this, then film one offer TikTok this week. #tiktok #fyp"
      : "Still writing Reels from a blank page? Steal the structure winners already proved. Save this, then film one offer Reel this week. #reels #contentcreator",
    music: [
      { k: "Mood", v: "Confident, modern, slight urgency." },
      { k: "Tempo", v: "Mid-tempo beat that hits on cuts." },
      { k: "Avoid", v: "Soft lo-fi under a punchy hook (energy mismatch)." },
      { k: "Drop", v: "Let the first beat land under your opening claim." },
    ],
  };
}
