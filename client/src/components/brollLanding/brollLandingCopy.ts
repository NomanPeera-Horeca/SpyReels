/** Landing copy + FAQ (aligned with prototype; caps removed per anonymous gating). */

export const BROLL_LANDING_SAMPLE_SCRIPT =
  "Most people quit their morning routine by day 10. Here's the one habit that actually stuck for me - and why it's so simple you'll wonder why nobody told you sooner.";

export const BROLL_LANDING_FAQ = [
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
    a: "SpyReels matches your script or transcript to real stock footage from Pexels' library, or generates an original AI video clip when no strong stock match exists.",
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
    q: "How is this different from just searching Pexels myself?",
    a: "SpyReels reads your full script or transcript, breaks it into the specific visual beats that need footage, and searches and places multiple matched clips automatically instead of manually reading each line and searching Pexels one keyword at a time.",
  },
] as const;

export const BROLL_LANDING_NICHES = [
  { href: "/free-tools/broll-generator/fitness-reels", label: "B-Roll for Fitness Reels" },
  {
    href: "/free-tools/broll-generator/real-estate-listings",
    label: "B-Roll for Real Estate Listings",
  },
  { href: "/free-tools/broll-generator/podcast-clips", label: "B-Roll for Podcast Clips" },
  { href: "/free-tools/broll-generator/youtube-shorts", label: "B-Roll for YouTube Shorts" },
  { href: "/free-tools/broll-generator/tiktok", label: "B-Roll for TikTok" },
  {
    href: "/free-tools/broll-generator/faceless-channels",
    label: "B-Roll for Faceless Channels",
  },
  {
    href: "/free-tools/broll-generator/ecommerce-product-videos",
    label: "B-Roll for E-commerce Product Videos",
  },
  {
    href: "/free-tools/broll-generator/coaching-content",
    label: "B-Roll for Coaching Content",
  },
] as const;

export const BROLL_LANDING_TITLE =
  "Free AI B-Roll Generator - Paste a Script or Upload a Video | SpyReels";

export const BROLL_LANDING_DESCRIPTION =
  "Generate matched B-roll from any script or video, free - no signup required to preview. SpyReels finds Pexels stock or AI-generated clips for every beat. Sign up to save, pay only to download.";

export const BROLL_LANDING_OG_DESCRIPTION =
  "Preview matched B-roll instantly with no login. SpyReels reads your script or video and finds the right clip for every beat.";
