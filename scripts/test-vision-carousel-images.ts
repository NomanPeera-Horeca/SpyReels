/**
 * E2E: vision-grounded carousel image paths A / B / C (pre-commit smoke).
 *
 * Run: pnpm exec tsx scripts/test-vision-carousel-images.ts
 *
 * Does NOT commit. Exercises production helpers:
 * resolveCarouselSourceFromUrl → ensureReelThumbnailOnR2 →
 * buildVisionGroundedImagePrompt → resolveSlideImage
 * (+ Path A: fetchCarouselSlideImages → analyzeSourceCarousel)
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

// resolveCarouselSourceFromUrl → stripe usage checks; other scripts use a dummy.
if (!process.env.STRIPE_SECRET_KEY?.trim()) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_vision_carousel_e2e";
}

function hostOf(url: string | null | undefined): string {
  if (!url) return "(null)";
  try {
    return new URL(url).host;
  } catch {
    return url.startsWith("data:") ? "data-url" : url.slice(0, 48);
  }
}

function sourceImageForSlideIndex(
  stills: string[],
  slideIndex: number
): string | null {
  if (stills.length === 0) return null;
  if (stills.length === 1) return stills[0] ?? null;
  const clamped = Math.min(Math.max(slideIndex, 0), stills.length - 1);
  return stills[clamped] ?? null;
}

function section(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

async function confirmNoPexelsInResolveSlideImage() {
  section("OFFLINE: resolveSlideImage.ts has no Pexels");
  const path = resolvePath("server/carousel/resolveSlideImage.ts");
  const src = readFileSync(path, "utf8");
  const hits = [
    "searchPexelsPhoto",
    "PEXELS",
    "pexels.com",
    "pexels",
  ].filter((needle) => src.toLowerCase().includes(needle.toLowerCase()));
  console.log("file:", path);
  console.log("pexels-related matches:", hits.length === 0 ? "NONE (pass)" : hits);
}

async function confirmEnv() {
  section("ENV");
  const keys = [
    "DATABASE_URL",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "CLOUDFLARE_R2_ENDPOINT",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_BUCKET",
    "CLOUDFLARE_R2_PUBLIC_URL",
  ];
  const report: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k]?.trim();
    report[k] = v ? `present(${v.length})` : "MISSING";
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function pathB() {
  section("PATH B — reel/video thumbnail → R2 → vision prompt → image");
  const t0 = Date.now();

  const {
    resolveCarouselSourceFromUrl,
  } = await import("../server/carousel/fetchSocialVideoSourceText");
  const { ensureReelThumbnailOnR2 } = await import("../server/reelThumbnailR2");
  const {
    buildVisionGroundedImagePrompt,
    resolveSlideImage,
  } = await import("../server/carousel/resolveSlideImage");

  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.query<{
    id: number;
    shortcode: string;
    reelUrl: string;
    thumbnailUrl: string;
    caption: string | null;
  }[]>(`
    SELECT id, shortcode, reelUrl, thumbnailUrl, LEFT(caption, 120) AS caption
    FROM collected_reels
    WHERE userId = 9
      AND platform = 'instagram'
      AND status = 'ready'
      AND reelUrl LIKE '%/reel/%'
      AND thumbnailUrl IS NOT NULL
      AND thumbnailUrl != ''
      AND (
        caption LIKE '%restaurant%'
        OR caption LIKE '%food%'
        OR caption LIKE '%Caterer%'
        OR caption LIKE '%food truck%'
      )
    ORDER BY id DESC
    LIMIT 5
  `);
  await conn.end();

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("No restaurant reel for user 9; aborting Path B.");
    return;
  }

  const pick = rows[0]!;
  console.log("DB source reel:", {
    collectedId: pick.id,
    shortcode: pick.shortcode,
    reelUrl: pick.reelUrl,
    thumbHost: hostOf(pick.thumbnailUrl),
    caption: pick.caption,
  });

  // Prefer production resolve → thumbnailUrl + reelId threading.
  let thumbnailUrl = pick.thumbnailUrl;
  let reelId = pick.shortcode;
  let resolveNote = "used DB thumb/reelId (resolve skipped or failed)";
  if (process.env.SKIP_PATH_B_RESOLVE === "1") {
    resolveNote = "SKIP_PATH_B_RESOLVE=1; using DB thumb/reelId";
  } else {
    try {
      const resolved = await resolveCarouselSourceFromUrl(pick.reelUrl, {
        userId: 9,
        openId: "google_110572221057258089999",
      });
      console.log("resolveCarouselSourceFromUrl:", {
        textChars: resolved.text?.length ?? 0,
        thumbnailUrlHost: hostOf(resolved.thumbnailUrl),
        reelId: resolved.reelId,
        thumbnailPreview: (resolved.thumbnailUrl || "").slice(0, 120),
      });
      if (resolved.thumbnailUrl?.trim()) {
        thumbnailUrl = resolved.thumbnailUrl.trim();
        resolveNote = "used resolveCarouselSourceFromUrl thumbnail";
      }
      if (resolved.reelId?.trim()) {
        reelId = resolved.reelId.trim();
      }
    } catch (err) {
      console.warn(
        "resolveCarouselSourceFromUrl failed; falling back to DB row:",
        err instanceof Error ? err.message : err
      );
    }
  }
  console.log("threading note:", resolveNote);

  const beforeHost = hostOf(thumbnailUrl);
  const beforeUrl = thumbnailUrl;
  console.log("ensureReelThumbnailOnR2 BEFORE:", {
    reelId,
    host: beforeHost,
    url: beforeUrl.slice(0, 160),
  });

  const mirrored = await ensureReelThumbnailOnR2(reelId, thumbnailUrl);
  console.log("ensureReelThumbnailOnR2 AFTER:", {
    host: hostOf(mirrored),
    url: mirrored.slice(0, 200),
    changed: mirrored !== beforeUrl,
    isR2: hostOf(mirrored).includes("r2.dev") || hostOf(mirrored).includes("cloudflare"),
    stillCdnInstagram:
      hostOf(mirrored).includes("cdninstagram") ||
      hostOf(mirrored).includes("fbcdn"),
  });

  // Also exercise raw-CDN → R2 if we can find a non-R2 thumb in reels table.
  const conn2 = await mysql.createConnection(process.env.DATABASE_URL!);
  const [cdnRows] = await conn2.query<{ shortcode: string; thumbnailUrl: string }[]>(`
    SELECT shortcode, thumbnailUrl FROM reels
    WHERE thumbnailUrl LIKE '%fbcdn%' OR thumbnailUrl LIKE '%cdninstagram%'
    ORDER BY id DESC LIMIT 1
  `);
  await conn2.end();
  if (Array.isArray(cdnRows) && cdnRows[0]) {
    const cdn = cdnRows[0];
    const testId = `e2e_${cdn.shortcode}`;
    console.log("\nExtra CDN mirror probe:", {
      shortcode: cdn.shortcode,
      beforeHost: hostOf(cdn.thumbnailUrl),
    });
    const cdnMirrored = await ensureReelThumbnailOnR2(testId, cdn.thumbnailUrl);
    console.log("CDN mirror result:", {
      afterHost: hostOf(cdnMirrored),
      afterUrl: cdnMirrored.slice(0, 180),
      stillRawCdn:
        hostOf(cdnMirrored).includes("fbcdn") ||
        hostOf(cdnMirrored).includes("cdninstagram"),
    });
  }

  const niche =
    "Restaurants-cafes · Instagram Reels viewers · How To Start A Restaurant With NO Experience";
  const slideTexts = [
    "THE RESTAURANT YOU SEE / THE GRIND NOBODY SEES.",
    "LOVING THE PACKED DINING ROOM / LOVING THE PREP WORK.",
    "DON'T JUST WORK HARDER / WORK SMARTER. STRATEGY WINS.",
  ];
  const styleHint = "restaurant kitchen documentary still photo";

  console.log("\n--- Vision prompts (Path B, shared thumb) ---");
  const prompts: string[] = [];
  for (let i = 0; i < slideTexts.length; i++) {
    const tPrompt = Date.now();
    const prompt = await buildVisionGroundedImagePrompt(
      mirrored,
      slideTexts[i]!,
      niche,
      styleHint
    );
    prompts.push(prompt);
    console.log(`\n[slide ${i + 1}] text: ${slideTexts[i]}`);
    console.log(`[slide ${i + 1}] prompt FULL (${prompt.length} chars, ${Date.now() - tPrompt}ms):`);
    console.log(prompt);
    console.log(
      `[slide ${i + 1}] looks text-only fallback?`,
      prompt.startsWith("A high-quality, realistic photo for a social media carousel slide.")
    );
  }

  console.log("\n--- resolveSlideImage (1-2 slides) ---");
  const imageResults: Array<{ slide: number; url: string | null; ms: number }> = [];
  for (let i = 0; i < Math.min(2, slideTexts.length); i++) {
    const tImg = Date.now();
    const url = await resolveSlideImage(styleHint, niche, undefined, slideTexts[i], {
      sourceImage: mirrored,
    });
    imageResults.push({ slide: i + 1, url, ms: Date.now() - tImg });
    console.log(`slide ${i + 1} image:`, {
      url,
      host: hostOf(url),
      ms: Date.now() - tImg,
    });
  }

  console.log("\nPath B summary:", {
    elapsedMs: Date.now() - t0,
    reelId,
    thumbBeforeHost: beforeHost,
    thumbAfterHost: hostOf(mirrored),
    promptCount: prompts.length,
    imageResults,
  });
}

async function pathA() {
  section("PATH A — IG carousel /p/ → analysis stills → vision prompt → image");
  const t0 = Date.now();

  const sourceUrl =
    "https://www.instagram.com/p/Db54YXzj6SS/?utm_source=ig_web_copy_link";
  console.log("Source (remake id 46 / Real Result Story / photo_story_test):", sourceUrl);

  const { fetchCarouselSlideImages } = await import("../server/instagram");
  const { analyzeSourceCarousel } = await import(
    "../server/carousel/analyzeSourceCarousel"
  );
  const {
    buildVisionGroundedImagePrompt,
    resolveSlideImage,
  } = await import("../server/carousel/resolveSlideImage");

  const slideImages = await fetchCarouselSlideImages(sourceUrl);
  console.log("fetchCarouselSlideImages:", {
    count: slideImages?.length ?? 0,
    hosts: (slideImages ?? []).slice(0, 6).map(hostOf),
    previews: (slideImages ?? []).slice(0, 3).map((u) => u.slice(0, 100)),
  });

  if (!slideImages || slideImages.length < 2) {
    console.log(
      "Fewer than 2 slide images from IG. Trying analyze with publicly reachable R2 stills from remake source thumb + restaurant stock fallbacks."
    );
    // Fallback: remake thumb already on R2 for this shortcode + a second public image
    const stills = [
      "https://pub-059f1c24b0b4430da6a57824dd88b55e.r2.dev/reel-thumbs/Db54YXzj6SS.jpg",
      "https://pub-059f1c24b0b4430da6a57824dd88b55e.r2.dev/reel-thumbs/Db7ptIhIrBm.jpg",
    ];
    await runPathAWithStills(stills, "fallback-2-r2-stills");
    console.log("Path A elapsedMs:", Date.now() - t0);
    return;
  }

  // Cap analysis to first 4 slides to control cost/time.
  const analysisUrls = slideImages.slice(0, Math.min(4, slideImages.length));
  console.log("analyzeSourceCarousel input count:", analysisUrls.length);

  let visionSourceStills = analysisUrls;
  let styleHints = analysisUrls.map(() => "documentary photo");
  let slideTexts = [
    "12 IMAGES THAT WILL CHANGE YOUR RESTAURANT",
    "THE RESTAURANT YOU SEE",
    "LOVING THE PACKED DINING ROOM",
  ];

  try {
    const analysis = await analyzeSourceCarousel(analysisUrls);
    console.log("analysis:", {
      slides: analysis.slides.length,
      resolvedImageUrls: analysis.resolvedImageUrls.length,
      resolvedHosts: analysis.resolvedImageUrls.map(hostOf),
      layouts: analysis.slides.map((s) => s.closestLayoutId),
      hasPhoto: analysis.slides.map((s) => s.hasPhoto),
    });
    visionSourceStills =
      analysis.resolvedImageUrls.filter(Boolean).length > 0
        ? analysis.resolvedImageUrls.filter(Boolean)
        : analysisUrls;
    styleHints = analysis.slides.map(
      (s) => s.imageStyleDescription || "documentary photo"
    );
    slideTexts = [
      analysis.slides[0]?.extractedText?.headline || slideTexts[0]!,
      analysis.slides[1]?.extractedText?.excuse ||
        analysis.slides[1]?.extractedText?.headline ||
        slideTexts[1]!,
      analysis.slides[2]?.extractedText?.excuse ||
        analysis.slides[2]?.extractedText?.headline ||
        slideTexts[2]!,
    ];
  } catch (err) {
    console.warn(
      "analyzeSourceCarousel failed; continuing with raw fetch URLs for mapping/prompts:",
      err instanceof Error ? err.message : err
    );
  }

  const mapped = [0, 1, 2].map((i) => ({
    slideIndex: i,
    sourceHost: hostOf(sourceImageForSlideIndex(visionSourceStills, i)),
    sourcePreview: (sourceImageForSlideIndex(visionSourceStills, i) || "").slice(
      0,
      100
    ),
  }));
  console.log("sourceImageForSlideIndex mapping:", mapped);
  const distinct = new Set(
    mapped.map((m) => m.sourcePreview).filter((p) => p.length > 0)
  ).size;
  console.log(
    "distinct stills for first 3 slides:",
    distinct,
    distinct > 1
      ? "(pass: different slides get different stills when multiple exist)"
      : "(only one unique still mapped)"
  );

  const niche =
    "Restaurants-cafes · Instagram Reels viewers · How To Start A Restaurant With NO Experience";

  // Prefer R2-stable stills for vision if CDN may expire mid-run:
  // download/mirrors not required for mapping evidence; prompts may fall back.
  for (let i = 0; i < 2; i++) {
    const sourceImage = sourceImageForSlideIndex(visionSourceStills, i);
    const styleHint = styleHints[i] || "documentary photo";
    const tPrompt = Date.now();
    const prompt = await buildVisionGroundedImagePrompt(
      sourceImage,
      slideTexts[i]!,
      niche,
      styleHint
    );
    console.log(`\n[Path A slide ${i + 1}] still host: ${hostOf(sourceImage)}`);
    console.log(`[Path A slide ${i + 1}] text: ${slideTexts[i]}`);
    console.log(
      `[Path A slide ${i + 1}] prompt FULL (${prompt.length} chars, ${Date.now() - tPrompt}ms):`
    );
    console.log(prompt);
    console.log(
      `[Path A slide ${i + 1}] text-only fallback?`,
      prompt.startsWith(
        "A high-quality, realistic photo for a social media carousel slide."
      )
    );
  }

  const tImg = Date.now();
  const url = await resolveSlideImage(
    styleHints[0] || "restaurant documentary",
    niche,
    undefined,
    slideTexts[0],
    { sourceImage: sourceImageForSlideIndex(visionSourceStills, 0) }
  );
  console.log("\nPath A resolveSlideImage slide 1:", {
    url,
    host: hostOf(url),
    ms: Date.now() - tImg,
  });
  console.log("Path A elapsedMs:", Date.now() - t0);
}

async function runPathAWithStills(stills: string[], label: string) {
  const {
    buildVisionGroundedImagePrompt,
    resolveSlideImage,
  } = await import("../server/carousel/resolveSlideImage");
  const { analyzeSourceCarousel } = await import(
    "../server/carousel/analyzeSourceCarousel"
  );

  console.log("Path A fallback stills label:", label, stills.map(hostOf));
  let analysis;
  try {
    analysis = await analyzeSourceCarousel(stills);
    console.log("fallback analysis:", {
      slides: analysis.slides.length,
      resolved: analysis.resolvedImageUrls.length,
      hosts: analysis.resolvedImageUrls.map(hostOf),
    });
  } catch (err) {
    console.warn(
      "analyzeSourceCarousel failed on fallback stills:",
      err instanceof Error ? err.message : err
    );
    analysis = {
      slides: [],
      resolvedImageUrls: stills,
    };
  }

  const visionSourceStills =
    analysis.resolvedImageUrls.filter(Boolean).length > 0
      ? analysis.resolvedImageUrls.filter(Boolean)
      : stills;

  const mapped = [0, 1].map((i) => sourceImageForSlideIndex(visionSourceStills, i));
  console.log(
    "mapped stills distinct?",
    mapped[0] !== mapped[1],
    mapped.map((u) => hostOf(u))
  );

  const niche = "Restaurants-cafes";
  for (let i = 0; i < 2; i++) {
    const prompt = await buildVisionGroundedImagePrompt(
      mapped[i]!,
      i === 0 ? "12 IMAGES THAT WILL CHANGE YOUR RESTAURANT" : "THE GRIND NOBODY SEES",
      niche,
      "lifestyle documentary"
    );
    console.log(`\n[fallback slide ${i + 1}] FULL prompt (${prompt.length} chars):`);
    console.log(prompt);
  }

  const url = await resolveSlideImage(
    "lifestyle documentary",
    niche,
    undefined,
    "12 IMAGES THAT WILL CHANGE YOUR RESTAURANT",
    { sourceImage: mapped[0] }
  );
  console.log("fallback resolveSlideImage:", { url, host: hostOf(url) });
}

async function pathC() {
  section("PATH C — no source image (text-only prompt → image)");
  const t0 = Date.now();
  const {
    buildVisionGroundedImagePrompt,
    buildTextOnlyImagePrompt,
    resolveSlideImage,
  } = await import("../server/carousel/resolveSlideImage");

  const niche = "Restaurants-cafes";
  const slideText = "THE OWNER WHO LEARNED AND TOOK ACTION.";
  const styleHint = "confident restaurant owner candid photo";

  const prompt = await buildVisionGroundedImagePrompt(
    null,
    slideText,
    niche,
    styleHint
  );
  const expected = buildTextOnlyImagePrompt(niche, styleHint, slideText);
  console.log("sourceImage: null");
  console.log("prompt FULL:");
  console.log(prompt);
  console.log("matches buildTextOnlyImagePrompt?", prompt === expected);
  console.log(
    "is text-only shape?",
    prompt.startsWith("A high-quality, realistic photo for a social media carousel slide.")
  );

  const tImg = Date.now();
  const url = await resolveSlideImage(styleHint, niche, undefined, slideText, {
    sourceImage: null,
  });
  console.log("resolveSlideImage:", {
    url,
    host: hostOf(url),
    ms: Date.now() - tImg,
  });
  console.log("Path C elapsedMs:", Date.now() - t0);
}

async function main() {
  console.log("test-vision-carousel-images start", new Date().toISOString());
  await confirmNoPexelsInResolveSlideImage();
  const env = await confirmEnv();

  if (env.ANTHROPIC_API_KEY === "MISSING") {
    console.error("ANTHROPIC_API_KEY missing — cannot test vision prompts via invokeLLM.");
  }
  if (env.OPENAI_API_KEY === "MISSING") {
    console.warn(
      "OPENAI_API_KEY MISSING — gpt-image-1.5 / resolveSlideImage will skip AI image generation. Vision + R2 wiring can still be verified."
    );
  }

  const only = (process.env.ONLY_PATHS || "B,A,C")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (only.includes("B")) await pathB();
  if (only.includes("A")) await pathA();
  if (only.includes("C")) await pathC();

  section("DONE — grep this log for pexels / Pexels");
  console.log("Script finished. No commit performed.");
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
