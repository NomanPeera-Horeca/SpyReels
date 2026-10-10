/**
 * Shared marketing copy slots (Figma Decision 32 / Text Rules B).
 * Labels/eyebrows are stored in sentence case; CSS displays them uppercase.
 */

export const marketingSharedCopy = {
  footer: {
    headline: "Find viral videos in your niche.",
    support:
      "Turn proven videos into scripts in your voice. Research to ready-to-film in 3 minutes.",
    categories: ["Product", "Free tools", "Platforms", "Resources", "Company"] as const,
  },
  headerGroupLabels: [
    "The core workflow",
    "Explore the toolkit",
    "Also in your workspace",
  ] as const,
  homepage: {
    workflowSupport:
      "Our AI agents find viral videos in your niche and remake the best ideas in your voice. You just film.",
    processSupport:
      "From niche research to ready-to-film content, SpyReels helps you show up on Instagram and TikTok.",
  },
  integrations: {
    telegram: "Send a Reel while you browse. Pick it up later in SpyReels.",
    ai: "Bring SpyReels research into the conversation where you develop ideas.",
  },
  responsibleResearch: {
    support:
      "SpyReels helps creators understand public content patterns while keeping creative decisions in their hands.",
  },
  productDemo: {
    kicker: "Spy viral Reels",
    badge: "Most viral",
    voiceBadge: "Written in your voice",
    hookLabel: "Hook",
    bodyLabel: "Body",
    findButton: "Find viral Reels",
    scriptHeading: "Your script is ready.",
    finalLine: "Find a proven video. Remake it in your voice.",
  },
} as const;
