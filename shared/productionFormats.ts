/**
 * Visual production format taxonomy for Reels (how it was filmed, not what it is about).
 * Labels and filming tips use plain language for creators.
 */
export const PRODUCTION_FORMAT_VALUES = [
  "talking_head",
  "b_roll_voiceover",
  "text_on_screen",
  "screen_recording",
  "montage",
  "skit_multi_person",
  "music_dance",
  "other",
] as const;

export type ProductionFormat = (typeof PRODUCTION_FORMAT_VALUES)[number];

export type ProductionFormatGuide = {
  label: string;
  /** One line: what this format looks like */
  shortDescription: string;
  /** Simple filming steps anyone can follow on a phone */
  filmingSteps: string;
};

export const PRODUCTION_FORMAT_GUIDES: Record<
  ProductionFormat,
  ProductionFormatGuide
> = {
  talking_head: {
    label: "Talking Head",
    shortDescription: "You talk straight to the camera, usually chest-up or close-up.",
    filmingSteps:
      "Prop your phone at eye level. Face a window or soft lamp. Keep the background clean. Say your hook in the first 2 seconds. Trim pauses in the edit.",
  },
  b_roll_voiceover: {
    label: "B-Roll + Voiceover",
    shortDescription: "Clips of what you are talking about, with your voice recorded over them.",
    filmingSteps:
      "Record your voice first (or write a short script). Film 3 to 6 short clips that match each point. Hold each clip 2 to 4 seconds. Lay clips under your voice in CapCut or similar.",
  },
  text_on_screen: {
    label: "Text On Screen",
    shortDescription: "The main message is big text on the video, often with music or a simple clip behind it.",
    filmingSteps:
      "Write your hook as 5 to 10 words max. Use a bold, readable font. Add one simple background clip or a solid color. Keep text on screen at least 2 seconds per line.",
  },
  screen_recording: {
    label: "Screen Recording",
    shortDescription: "You show your phone or computer screen while explaining something.",
    filmingSteps:
      "Clean up notifications first. Record the screen in one take if you can. Use a small face bubble in the corner if you want. Zoom in on the important taps. Add a short voiceover if the recording has no speech.",
  },
  montage: {
    label: "Montage",
    shortDescription: "Many quick cuts synced to music or a fast beat, often lifestyle or aesthetic.",
    filmingSteps:
      "Pick one song or sound. Film 8 to 15 tiny clips (1 to 2 seconds each). Match cuts to the beat. Use the same color filter on every clip so it feels cohesive.",
  },
  skit_multi_person: {
    label: "Skit / Multiple People",
    shortDescription: "Acting, characters, or more than one person on camera.",
    filmingSteps:
      "Plan who says each line. Film one angle per character if you play multiple roles. Use different shirts or props to tell characters apart. Keep lines short and punchy.",
  },
  music_dance: {
    label: "Music / Dance",
    shortDescription: "Movement or lip-sync driven by audio, little or no spoken teaching.",
    filmingSteps:
      "Find the trending sound first. Rehearse the move or lip-sync twice. Film in good light with the full body or face in frame. Hit the beat on the first second.",
  },
  other: {
    label: "Other",
    shortDescription: "Mixed or unusual setup that does not fit the categories above.",
    filmingSteps:
      "Study the original pacing and copy the structure, not the exact visuals. Keep lighting simple and audio clear if there is speech.",
  },
};

export function formatProductionFormatLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  const guide = PRODUCTION_FORMAT_GUIDES[raw as ProductionFormat];
  return guide?.label ?? raw.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function productionFormatFilmingTip(raw: string | null | undefined): string {
  if (!raw) return "";
  const guide = PRODUCTION_FORMAT_GUIDES[raw as ProductionFormat];
  return guide?.filmingSteps ?? "";
}

export function productionFormatTooltip(raw: string | null | undefined): string {
  if (!raw) return "";
  const guide = PRODUCTION_FORMAT_GUIDES[raw as ProductionFormat];
  if (!guide) return formatProductionFormatLabel(raw);
  return `${guide.shortDescription}\n\nHow to film: ${guide.filmingSteps}`;
}
