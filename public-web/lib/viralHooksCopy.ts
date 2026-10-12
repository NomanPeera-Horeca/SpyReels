export const VIRAL_HOOKS_PATH = "/free-tools/viral-hooks";

export const VIRAL_HOOKS_HOW_IT_WORKS_STEPS = [
  {
    number: "1",
    title: "Describe your video",
    body: "Enter your Reel topic or idea in a few words or sentences.",
  },
  {
    number: "2",
    title: "Pick your style",
    body: "Curiosity, contrarian, story open, or mix of patterns.",
  },
  {
    number: "3",
    title: "Generate hooks",
    body: "Get 10 scroll-stopping opens with spoken lines + on-screen text.",
  },
  {
    number: "4",
    title: "Copy and film",
    body: "Use as-is, or turn any hook into a full SpyReels script.",
  },
] as const;

export const VIRAL_HOOKS_TRAIT_CARDS = [
  {
    title: "Emotional precision",
    body: "Curiosity, FOMO, surprise, or relief in the first frame.",
  },
  {
    title: "Instant first impression",
    body: "No warm-up. Punch in under 2 seconds.",
  },
  {
    title: "Built for the algorithm",
    body: "Retention starts at second one. Hooks protect watch time.",
  },
  {
    title: "Open loop psychology",
    body: "Leave a gap the viewer has to close by watching.",
  },
] as const;

/** Same 10 patterns as the old live HookGenerator page. */
export const VIRAL_HOOKS_PATTERNS = [
  ["Cost reveal", "I was paying $4K/month until I changed this one thing"],
  ["Mistake call-out", "Stop doing X if you actually want Y"],
  ["Curiosity loop", "The real reason X fails is not what you think"],
  ["Contrarian", "Everyone says X. They are wrong."],
  ["Result-first", "I cut X by 40% in 30 days. Here is how."],
  ["Question hook", "Why does X never work the way they promise?"],
  ["Specific number", "3 things I wish I knew before starting X"],
  ["Time-bound", "I tried X for 30 days. Results shocked me."],
  ["Personal stake", "If you are stuck at X, this changed everything"],
  ["Authority flip", "I am a [pro]. Here is what they will not tell you"],
] as const;

/** Same comparison rows as the old live HookGenerator page. */
export const VIRAL_HOOKS_COMPARISON_ROWS = [
  ["Spoken + on-screen text", "Yes", "No", "No"],
  ["Reel / TikTok / Shorts patterns", "Yes", "Manual", "Generic"],
  ["Turn hook into full script", "Yes", "Prompting", "No"],
  ["Trained on viral short-form", "Yes", "General", "Marketing copy"],
] as const;
