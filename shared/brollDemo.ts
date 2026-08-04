/**
 * Static demo for the public B-roll generator funnel.
 *
 * Choice: curated static demo data (not live anonymous Pexels calls).
 * Keeps the preview fast, stable, and free of API key / rate-limit risk
 * for unauthenticated visitors. Authenticated runs use live Pexels via
 * scripts.suggestBroll.
 */

import type { SuggestBrollResult } from "./broll";
import { BROLL_PEXELS_ATTRIBUTION } from "./broll";

export const BROLL_DEMO_SCRIPT = `Stop scrolling if your Reels feel flat.
Most creators film talking-head only and wonder why retention drops.
Your audience needs a visual reset every few seconds.
Show the problem, then cut to proof, then show the outcome.
That simple beat structure is how faceless and hybrid Reels keep people watching.
Try it on your next script and watch completion climb.`;

/** Curated demo beats + placeholder clip metadata (real Pexels-style attribution shape). */
export const BROLL_DEMO_RESULT: SuggestBrollResult = {
  attributionNote: BROLL_PEXELS_ATTRIBUTION,
  beats: [
    {
      index: 0,
      scriptText: "Stop scrolling if your Reels feel flat.",
      visualSummary: "Creator staring at phone looking frustrated",
      searchQuery: "person phone frustrated",
      clips: [
        {
          id: 3045163,
          thumbnailUrl:
            "https://images.pexels.com/videos/3045163/free-video-3045163.jpg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
          // Demo uses thumbnails + Pexels page links only (no anonymous MP4 fetch).
          previewUrl: "",
          durationSeconds: 12,
          width: 1080,
          height: 1920,
          sourceUrl: "https://www.pexels.com/video/a-woman-using-a-smartphone-3045163/",
          photographerName: "Ketut Subiyanto",
          photographerUrl: "https://www.pexels.com/@ketut-subiyanto",
        },
      ],
    },
    {
      index: 1,
      scriptText: "Most creators film talking-head only and wonder why retention drops.",
      visualSummary: "Person talking to camera in bright room",
      searchQuery: "talking head creator",
      clips: [
        {
          id: 3209822,
          thumbnailUrl:
            "https://images.pexels.com/videos/3209822/free-video-3209822.jpg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
          previewUrl: "",
          durationSeconds: 15,
          width: 1080,
          height: 1920,
          sourceUrl: "https://www.pexels.com/video/a-man-talking-while-looking-at-the-camera-3209822/",
          photographerName: "Cottonbro Studio",
          photographerUrl: "https://www.pexels.com/@cottonbro",
        },
      ],
    },
    {
      index: 2,
      scriptText: "Your audience needs a visual reset every few seconds.",
      visualSummary: "Fast city montage with motion blur",
      searchQuery: "city motion blur",
      clips: [
        {
          id: 854671,
          thumbnailUrl:
            "https://images.pexels.com/videos/854671/free-video-854671.jpg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
          previewUrl: "",
          durationSeconds: 10,
          width: 1920,
          height: 1080,
          sourceUrl: "https://www.pexels.com/video/time-lapse-video-of-city-traffic-854671/",
          photographerName: "Pixabay",
          photographerUrl: "https://www.pexels.com/@pixabay",
        },
      ],
    },
    {
      index: 3,
      scriptText: "Show the problem, then cut to proof, then show the outcome.",
      visualSummary: "Before and after desk setup transformation",
      searchQuery: "desk setup workspace",
      clips: [
        {
          id: 5495902,
          thumbnailUrl:
            "https://images.pexels.com/videos/5495902/free-video-5495902.jpg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
          previewUrl: "",
          durationSeconds: 14,
          width: 1080,
          height: 1920,
          sourceUrl: "https://www.pexels.com/video/a-person-working-on-a-laptop-5495902/",
          photographerName: "Tima Miroshnichenko",
          photographerUrl: "https://www.pexels.com/@tima-miroshnichenko",
        },
      ],
    },
  ],
};
