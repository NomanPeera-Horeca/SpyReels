export const PLAN_FORMAT_LABELS: Record<string, string> = {
  "talking-head": "Talking Head",
  "voiceover-broll": "Voiceover",
  "behind-the-scenes": "BTS",
  "tutorial-demo": "Tutorial",
  "trending-audio": "Trending",
  faceless: "Faceless",
};

export const FUNNEL_STAGE_TOOLTIPS: Record<string, string> = {
  tofu:
    "Top of Funnel (TOFU). For people who do not know you yet. Goal: reach, shares, and new followers.",
  mofu:
    "Middle of Funnel (MOFU). For followers who need more trust. Case studies, proof, and deeper education.",
  bofu:
    "Bottom of Funnel (BOFU). For warm audience ready to act. Leads, DMs, bookings, or sales.",
};

export const CONTENT_FORMAT_TOOLTIPS: Record<string, string> = {
  "talking-head":
    "Talking Head. You speak straight to camera. Best for tips, hot takes, and personal stories.",
  "voiceover-broll":
    "Voiceover + B-roll. Narration over footage of your work, product, or day. Great for showcases.",
  "behind-the-scenes":
    "Behind the Scenes (BTS). Show real process, installs, or workspace. Feels authentic and insider.",
  "tutorial-demo":
    "Tutorial / Demo. Step-by-step walkthrough on camera. Teach one thing clearly.",
  "trending-audio":
    "Trending Audio / POV. Built around a popular sound or POV format on Reels or TikTok.",
  faceless:
    "Faceless. Bold text on screen over stock or B-roll. No face on camera required.",
};

export function funnelTooltip(stage: string): string {
  return FUNNEL_STAGE_TOOLTIPS[stage] ?? FUNNEL_STAGE_TOOLTIPS.tofu;
}

export function formatTooltip(formatKey: string): string {
  return (
    CONTENT_FORMAT_TOOLTIPS[formatKey] ??
    "Content format for how this video should be filmed and edited."
  );
}
