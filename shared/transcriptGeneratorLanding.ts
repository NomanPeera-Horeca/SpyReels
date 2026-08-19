export type TranscriptGeneratorVariant =
  | "instagram"
  | "tiktok"
  | "youtubeShorts"
  | "youtube";

export type TranscriptGeneratorCopy = {
  variant: TranscriptGeneratorVariant;
  path: string;
  breadcrumbLabel: string;
  h1Before: string;
  h1Em: string;
  h1After: string;
  sub: string;
  answer: string;
  toolHead: string;
  urlLabel: string;
  urlPlaceholder: string;
  pasteCta: string;
  uploadCta: string;
  remakeCta: string;
  remakeHeadline: string;
  remakeBody: string;
  platform: "instagram" | "tiktok" | "youtube";
  /** When true, only accept Shorts-style YouTube URLs in copy (API still accepts watch URLs on youtube variant). */
  shortsOnly: boolean;
  metaTitle: string;
  metaDescription: string;
  schemaName: string;
  primaryKeyword: string;
  howTitle: string;
  howLead: string;
  steps: Array<{ title: string; body: string }>;
  personasTitle: string;
  personas: Array<{ title: string; body: string }>;
  compareTitle: string;
  compareLead: string;
  platformsTitle: string;
  platformsLead: string;
  faq: Array<{ q: string; a: string }>;
  finalHeadline: string;
  finalBody: string;
  finalCta: string;
};

/** sessionStorage: pending remake after public transcript + auth. */
export const TRANSCRIPT_GENERATOR_PENDING_KEY = "spyreels_transcript_gen_pending_v1";

export type TranscriptGeneratorPending = {
  sessionToken: string;
  url: string;
  path: string;
  platform: "instagram" | "tiktok" | "youtube";
  variant: TranscriptGeneratorVariant;
};

export const TRANSCRIPT_GENERATOR_COPY: Record<
  TranscriptGeneratorVariant,
  TranscriptGeneratorCopy
> = {
  instagram: {
    variant: "instagram",
    path: "/free-tools/instagram-transcript-generator",
    breadcrumbLabel: "Instagram Transcript Generator",
    h1Before: "Instagram ",
    h1Em: "transcript generator",
    h1After: "",
    sub: "Paste a Reel URL or upload a video. Get the text. Remake it in your voice.",
    answer:
      "An Instagram transcript generator turns a Reel or Instagram video into searchable text so you can study hooks, pacing, and lines without scrubbing the clip. SpyReels goes further: after you get the transcript, remake the Reel in your voice, answer a short onboarding, and land on your script page with the source reel beside your rewrite.",
    toolHead: "Instagram → text",
    urlLabel: "Instagram Reel or video URL",
    urlPlaceholder: "https://www.instagram.com/reel/…",
    pasteCta: "Get Instagram transcript",
    uploadCta: "Transcribe uploaded video",
    remakeCta: "Remake in your voice",
    remakeHeadline: "Remake this Reel in your voice",
    remakeBody:
      "Transcript is yours above. Next: keep the proven structure, answer a few onboarding questions, and open your script with the source reel on the side.",
    platform: "instagram",
    shortsOnly: false,
    metaTitle: "Free Instagram Transcript Generator | Reels to Text",
    metaDescription:
      "Paste an Instagram Reel URL and get a free transcript. Then remake it in your voice and open the script with the source reel. Start free on SpyReels.",
    schemaName: "SpyReels Instagram Transcript Generator",
    primaryKeyword: "instagram transcript generator",
    howTitle: "How to get a transcript from an Instagram Reel",
    howLead: "Four steps from paste URL to a remake script you can film.",
    steps: [
      {
        title: "Paste URL or upload",
        body: "Drop a public Instagram Reel URL, or upload an MP4 / MOV you are authorized to process.",
      },
      {
        title: "Get Reels to text",
        body: "SpyReels converts speech to a clean Instagram Reel transcript you can read and copy.",
      },
      {
        title: "Remake in your voice",
        body: "Run the same onboarding you use for viral remakes so the rewrite sounds like you.",
      },
      {
        title: "Open script + source reel",
        body: "Land on your script page with the source reel beside your new spoken lines.",
      },
    ],
    personasTitle: "Who uses an Instagram transcript generator",
    personas: [
      {
        title: "Content creators and influencers",
        body: "Analyze Instagram Reels transcripts for hook clarity and storytelling, then remake winners in your voice.",
      },
      {
        title: "Digital marketers and social managers",
        body: "Convert authorized Instagram videos into searchable transcript text for campaign review, then brief creators with a remake-ready script.",
      },
      {
        title: "SEO and content writers",
        body: "Turn Reels you own or are authorized to process into notes, summaries, and blog seeds without scrubbing every second.",
      },
      {
        title: "Brand and UGC researchers",
        body: "Use Instagram video transcription on approved UGC to capture customer language, then rewrite the structure for your brand voice.",
      },
    ],
    compareTitle: "SpyReels vs transcript-only tools",
    compareLead:
      "Paste-URL transcript tools solve Reels to text. SpyReels keeps the next step: remake in your voice with the source reel on your script screen.",
    platformsTitle: "Transcribe videos from other platforms",
    platformsLead: "Same remake workflow for TikTok, YouTube Shorts, and long YouTube.",
    faq: [
      {
        q: "How to get a transcript from Instagram Reels or videos?",
        a: "Paste the public Instagram Reel URL into SpyReels, click Get Instagram transcript, then read or copy the text. From there you can remake the Reel in your voice and open the script next to the source reel.",
      },
      {
        q: "Is there a free Instagram to text converter online?",
        a: "Yes. The full transcript is free with no signup. Create an account only when you want to remake the structure in your voice and save the script.",
      },
      {
        q: "Do I need to log in to get text from an Instagram video?",
        a: "No signup to get the full transcript. Sign in only when you hit Remake in your voice so we can run onboarding and save your script.",
      },
      {
        q: "Can I upload a video file instead of a URL?",
        a: "Yes. Use the Upload video tab for MP4, MOV, and common audio formats you own or are authorized to process. Sign in if the upload path needs your account.",
      },
      {
        q: "How accurate is this AI transcript for Instagram?",
        a: "Accuracy depends on audio quality, accents, and background music. Clear talking-head Reels usually read clean. Always skim the transcript before you remake or publish.",
      },
      {
        q: "Is there a script extractor for Instagram?",
        a: "An Instagram script extractor is the same job as Reels to text. SpyReels adds remake in your voice so the extractor output becomes your script, not just a dump.",
      },
    ],
    finalHeadline: "Generate Instagram transcripts, then remake",
    finalBody:
      "Process Instagram videos you own, that are publicly accessible, or that you are authorized to analyze. Then rewrite the structure in your voice.",
    finalCta: "Start converting Instagram to text",
  },
  tiktok: {
    variant: "tiktok",
    path: "/free-tools/tiktok-transcript-generator",
    breadcrumbLabel: "TikTok Transcript Generator",
    h1Before: "TikTok ",
    h1Em: "transcript generator",
    h1After: "",
    sub: "Paste a TikTok URL or upload a video. Get the text. Remake it in your voice.",
    answer:
      "A TikTok transcript generator turns a TikTok video into searchable text so you can study hooks, pacing, and lines without scrubbing the clip. SpyReels goes further: after you get the transcript, remake the TikTok in your voice, answer a short onboarding, and land on your script page with the source video beside your rewrite.",
    toolHead: "TikTok → text",
    urlLabel: "TikTok video URL",
    urlPlaceholder: "https://www.tiktok.com/@…/video/…",
    pasteCta: "Get TikTok transcript",
    uploadCta: "Transcribe uploaded video",
    remakeCta: "Remake in your voice",
    remakeHeadline: "Remake this TikTok in your voice",
    remakeBody:
      "Transcript is yours above. Next: keep the proven structure, answer a few onboarding questions, and open your script with the source on the side.",
    platform: "tiktok",
    shortsOnly: false,
    metaTitle: "Free TikTok Transcript Generator | Video to Text",
    metaDescription:
      "Free TikTok transcript generator: paste a link for video to text, copy the transcript, then remake the structure in your voice on SpyReels. Start free.",
    schemaName: "SpyReels TikTok Transcript Generator",
    primaryKeyword: "tiktok transcript generator",
    howTitle: "How to transcribe a TikTok video to text",
    howLead: "Four steps from paste URL to a remake script you can film.",
    steps: [
      {
        title: "Paste URL or upload",
        body: "Drop a public TikTok URL, or upload an MP4 / MOV you are authorized to process.",
      },
      {
        title: "Get TikTok to text",
        body: "SpyReels converts speech to a clean TikTok transcript you can read and copy. Works as a TikTok to text converter and link to transcript tool.",
      },
      {
        title: "Remake in your voice",
        body: "Run the same onboarding you use for viral remakes so the rewrite sounds like you.",
      },
      {
        title: "Open script + source",
        body: "Land on your script page with the source video beside your new spoken lines.",
      },
    ],
    personasTitle: "Who uses a TikTok transcript tool",
    personas: [
      {
        title: "Content creators and influencers",
        body: "Analyze TikTok transcripts for hook clarity and storytelling, then remake winners in your voice.",
      },
      {
        title: "Digital marketers and social managers",
        body: "Convert authorized TikTok videos into searchable transcript text for campaign review.",
      },
      {
        title: "SEO and content writers",
        body: "Turn TikToks you own or are authorized to process into notes, summaries, and blog seeds.",
      },
      {
        title: "Brand and UGC researchers",
        body: "Use TikTok video transcription on approved UGC to capture customer language.",
      },
    ],
    compareTitle: "SpyReels vs transcript-only TikTok tools",
    compareLead:
      "Paste-URL transcript tools solve TikTok to text. SpyReels keeps the next step: remake in your voice with the source on your script screen.",
    platformsTitle: "Transcribe videos from other platforms",
    platformsLead: "Same remake workflow for Instagram, YouTube Shorts, and long YouTube.",
    faq: [
      {
        q: "How do I get a transcript from a TikTok video?",
        a: "Paste the public TikTok URL into SpyReels, click Get TikTok transcript, then read or copy the text. From there remake in your voice.",
      },
      {
        q: "Is there a free TikTok transcript generator online?",
        a: "Yes. This free TikTok transcript generator shows the full transcript with no signup. Create an account only when you want to remake and save the script.",
      },
      {
        q: "Can I convert a TikTok video to text?",
        a: "Yes. Paste the TikTok link for TikTok to text. SpyReels is a TikTok to text converter that returns speech as searchable transcript text you can copy.",
      },
      {
        q: "How do I get a transcript from a TikTok link?",
        a: "Use this page as a TikTok link to transcript tool: paste the URL, generate, then copy. No desktop app required.",
      },
      {
        q: "Can I download a TikTok transcript?",
        a: "You can copy the full transcript from the results and paste it into a doc. SpyReels focuses on readable text and remake, not ripping the video file.",
      },
      {
        q: "Is this TikTok speech to text?",
        a: "Yes. TikTok speech to text is the same job as a TikTok transcript generator: convert spoken audio into text, then optionally remake the structure in your voice.",
      },
      {
        q: "TikTok converter vs TikTok transcript generator?",
        a: "People searching TikTok converter often want video to text. Use this TikTok transcript generator for that. For writing a new script from an idea, use the TikTok script generator instead.",
      },
      {
        q: "Can I use this as a TikTok script extractor?",
        a: "Yes. A TikTok script extractor pulls spoken lines from a video URL. SpyReels then remakes that structure in your voice so you do not stop at a text dump.",
      },
      {
        q: "What about TikTok script generator vs transcript?",
        a: "Transcript = URL to text from an existing TikTok. Script generator = idea to a new spoken script. Use both: steal structure from a transcript, then write your version.",
      },
      {
        q: "Can I upload a TikTok file?",
        a: "Yes. Use Upload video for files you own or are authorized to process, then remake in your voice after signup if needed.",
      },
    ],
    finalHeadline: "Generate TikTok transcripts, then remake",
    finalBody:
      "Process TikTok videos you own, that are publicly accessible, or that you are authorized to analyze. Then rewrite the structure in your voice.",
    finalCta: "Start converting TikTok to text",
  },
  youtubeShorts: {
    variant: "youtubeShorts",
    path: "/free-tools/youtube-shorts-transcript",
    breadcrumbLabel: "YouTube Shorts Transcript",
    h1Before: "YouTube Shorts ",
    h1Em: "transcript",
    h1After: "",
    sub: "Paste a Short URL or upload a video. Get the text. Remake it in your voice.",
    answer:
      "A YouTube Shorts transcript generator turns a Short into searchable text so you can study hooks, pacing, and lines without scrubbing the clip. SpyReels goes further: after you get the transcript, remake the Short in your voice, answer a short onboarding, and land on your script page with the source Short beside your rewrite.",
    toolHead: "YouTube Short → text",
    urlLabel: "YouTube Short URL",
    urlPlaceholder: "https://www.youtube.com/shorts/…",
    pasteCta: "Get Shorts transcript",
    uploadCta: "Transcribe uploaded video",
    remakeCta: "Remake in your voice",
    remakeHeadline: "Remake this Short in your voice",
    remakeBody:
      "Transcript is yours above. Next: keep the proven structure, answer a few onboarding questions, and open your script with the source on the side.",
    platform: "youtube",
    shortsOnly: true,
    metaTitle: "Free YouTube Shorts Transcript | Shorts to Text",
    metaDescription:
      "Convert any YouTube Short to text. Then remake the Short in your voice with SpyReels and open your script next to the source video. Start free.",
    schemaName: "SpyReels YouTube Shorts Transcript",
    primaryKeyword: "youtube shorts transcript",
    howTitle: "How to get a transcript from a YouTube Short",
    howLead: "Four steps from paste URL to a remake script you can film.",
    steps: [
      {
        title: "Paste URL or upload",
        body: "Drop a public YouTube Short URL, or upload an MP4 / MOV you are authorized to process.",
      },
      {
        title: "Get Shorts to text",
        body: "SpyReels converts speech to a clean YouTube Shorts transcript you can read and copy.",
      },
      {
        title: "Remake in your voice",
        body: "Run the same onboarding you use for viral remakes so the rewrite sounds like you.",
      },
      {
        title: "Open script + source",
        body: "Land on your script page with the source Short beside your new spoken lines.",
      },
    ],
    personasTitle: "Who uses a YouTube Shorts transcript tool",
    personas: [
      {
        title: "Content creators",
        body: "Analyze Shorts transcripts for hook clarity, then remake winners in your voice.",
      },
      {
        title: "Social managers",
        body: "Convert authorized Shorts into searchable text for campaign review.",
      },
      {
        title: "Repurposing teams",
        body: "Pull Shorts to text, then rewrite for Reels or TikTok in your brand voice.",
      },
      {
        title: "Researchers",
        body: "Use Shorts transcripts on approved assets to capture language and structure.",
      },
    ],
    compareTitle: "Shorts transcript vs long YouTube transcript",
    compareLead:
      "Shorts are short-form like Reels and TikTok. Long YouTube videos use a separate page, then remake into a short script in your voice.",
    platformsTitle: "Transcribe videos from other platforms",
    platformsLead: "Same remake workflow for Instagram, TikTok, and long YouTube.",
    faq: [
      {
        q: "How to get a transcript from a YouTube Short?",
        a: "Paste the public Short URL into SpyReels, click Get Shorts transcript, then read or copy the text. Remake in your voice when you are ready.",
      },
      {
        q: "Is there a free YouTube Shorts transcript generator?",
        a: "Yes. The full transcript is free with no signup. Sign in only to remake and save the script.",
      },
      {
        q: "Is this different from a long YouTube transcript generator?",
        a: "Yes. Shorts are short-form. Long YouTube videos use /free-tools/youtube-transcript-generator, then remake into a short script in your voice.",
      },
      {
        q: "Do I need to log in?",
        a: "No signup for the full transcript. Sign in only for Remake in your voice.",
      },
      {
        q: "Can I upload a Short file?",
        a: "Yes. Use Upload video for files you own or are authorized to process.",
      },
      {
        q: "What is a youtube shorts transcript generator?",
        a: "It converts a YouTube Short URL into text, then optionally remakes the Short in your voice inside SpyReels.",
      },
    ],
    finalHeadline: "Generate YouTube Shorts transcripts, then remake",
    finalBody:
      "Process YouTube Shorts you own, that are publicly accessible, or that you are authorized to analyze. Then rewrite the structure in your voice.",
    finalCta: "Start converting Shorts to text",
  },
  youtube: {
    variant: "youtube",
    path: "/free-tools/youtube-transcript-generator",
    breadcrumbLabel: "YouTube Transcript Generator",
    h1Before: "YouTube ",
    h1Em: "transcript generator",
    h1After: "",
    sub: "Paste any YouTube URL or upload a video. Get the text. Remake a short cut in your voice.",
    answer:
      "A YouTube transcript generator turns a video into searchable text so you can study hooks, claims, and structure without scrubbing the timeline. SpyReels goes further: after you get the transcript, cut a short-form remake in your voice, answer a short onboarding, and land on your script page with the source video beside your rewrite.",
    toolHead: "YouTube video → text",
    urlLabel: "YouTube video URL",
    urlPlaceholder: "https://www.youtube.com/watch?v=…",
    pasteCta: "Get YouTube transcript",
    uploadCta: "Transcribe uploaded video",
    remakeCta: "Remake a short cut in your voice",
    remakeHeadline: "Remake a short cut in your voice",
    remakeBody:
      "Transcript is yours above. Next: SpyReels writes a short-form script in your voice from this video, then opens it next to the source.",
    platform: "youtube",
    shortsOnly: false,
    metaTitle: "Free YouTube Transcript Generator | Video to Text",
    metaDescription:
      "Free YouTube transcript generator online: paste a link, get video to text, copy the transcript, then remake a short cut in your voice with SpyReels.",
    schemaName: "SpyReels YouTube Transcript Generator",
    primaryKeyword: "youtube transcript generator",
    howTitle: "How to transcribe a YouTube video",
    howLead: "Four steps from paste URL to a short-form remake script you can film.",
    steps: [
      {
        title: "Paste URL or upload",
        body: "Drop a public YouTube URL (long-form or Shorts), or upload a file you are authorized to process.",
      },
      {
        title: "Get video to text",
        body: "SpyReels converts speech to a clean YouTube transcript you can read, copy, or scroll. Use it as a YouTube to transcript converter from any public link.",
      },
      {
        title: "Remake a short cut in your voice",
        body: "Keep the winning ideas. SpyReels writes a short-form script in your voice, not an auto-edited MP4.",
      },
      {
        title: "Open script + source",
        body: "Land on your script page with the source video beside your new spoken lines.",
      },
    ],
    personasTitle: "Who uses a YouTube transcript generator",
    personas: [
      {
        title: "Creators",
        body: "Pull long-form ideas into short scripts you can film this week.",
      },
      {
        title: "Marketers",
        body: "Turn authorized YouTube videos into searchable transcript text for campaigns.",
      },
      {
        title: "Writers and SEO",
        body: "Convert videos into notes, summaries, and blog seeds.",
      },
      {
        title: "Teams",
        body: "Share transcripts, then remake short cuts in a consistent brand voice.",
      },
    ],
    compareTitle: "SpyReels vs NoteGPT / Tactiq-style tools",
    compareLead:
      "Transcript-only tools stop at text. SpyReels continues to a short-form remake script in your voice with the source video on the side.",
    platformsTitle: "Transcribe videos from other platforms",
    platformsLead: "Same remake workflow for Instagram, TikTok, and YouTube Shorts.",
    faq: [
      {
        q: "How can I get a transcript from a YouTube video?",
        a: "Paste the public YouTube URL into SpyReels, click Get YouTube transcript, then read or copy the text. Remake a short cut in your voice when you are ready.",
      },
      {
        q: "Is there a free YouTube transcript generator online?",
        a: "Yes. This free YouTube transcript generator shows the full paste-URL transcript with no signup. Sign in only to remake a short cut and save the script.",
      },
      {
        q: "Can I convert a YouTube link to a transcript?",
        a: "Yes. Paste any public YouTube link for a YouTube to transcript converter workflow: URL in, searchable text out, then optional short-form remake.",
      },
      {
        q: "What is the best free transcript generator for YouTube?",
        a: "If you need YouTube video to text plus a remake path, use SpyReels. Transcript-only sites stop at copy text. SpyReels continues to a short script in your voice.",
      },
      {
        q: "How do I extract a transcript from a YouTube video?",
        a: "Use this page as a YouTube transcript extractor: paste the URL, generate, then copy. For Shorts-only links, the dedicated Shorts transcript page also works.",
      },
      {
        q: "Does this work on long-form videos and Shorts?",
        a: "Yes. This page supports any public YouTube video, including long-form. YouTube Shorts also have a dedicated page at /free-tools/youtube-shorts-transcript.",
      },
      {
        q: "Do you auto-edit the long video into a short MP4?",
        a: "No. SpyReels writes a short-form script in your voice from the transcript so you can film it. That is the remake wedge.",
      },
      {
        q: "Is it legal to transcribe YouTube videos?",
        a: "Only process videos you own, that are publicly accessible for personal analysis, or that you are authorized to analyze. Do not redistribute someone else's content.",
      },
      {
        q: "YouTube transcript converter vs captions on YouTube?",
        a: "YouTube captions help when they exist. SpyReels is a YouTube transcript converter for paste-URL workflows, copy-friendly text, and remaking a short cut in your voice.",
      },
      {
        q: "What is a youtube script transcriber?",
        a: "It is search language for a YouTube transcript generator. SpyReels targets that intent, then helps you remake short-form scripts from the long video.",
      },
    ],
    finalHeadline: "Generate YouTube transcripts, then remake",
    finalBody:
      "Process YouTube videos you own, that are publicly accessible, or that you are authorized to analyze. Then rewrite a short cut in your voice.",
    finalCta: "Start converting YouTube to text",
  },
};

export const TRANSCRIPT_GENERATOR_VARIANTS: TranscriptGeneratorVariant[] = [
  "instagram",
  "tiktok",
  "youtubeShorts",
  "youtube",
];
