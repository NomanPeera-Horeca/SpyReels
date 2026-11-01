import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisSourceSnapshot } from "@shared/personalization/model";
import { parseAudienceOutput } from "./audienceRecommendations";
import { buildCreatorEvidence } from "./evidence";
import { buildPillarPrompt, parsePillarOutput } from "./pillarRecommendations";
import {
  citableSources,
  fetchableImageUrl,
  keepCited,
  loadPostImages,
  noPostImages,
  postImagesEnabled,
  postIndex,
  type PostContext,
} from "./postVisuals";

const snapshot = (posts: Array<{ id: string; views: number | null; caption: string; thumb?: string }>): AnalysisSourceSnapshot => ({
  version: 1,
  platform: "instagram",
  handle: "founder",
  followerCount: null,
  windowStart: "",
  windowEnd: "",
  posts: posts.map(p => ({
    postId: p.id,
    url: null,
    publishedAt: null,
    views: p.views,
    likes: null,
    comments: null,
    durationSec: null,
    caption: p.caption,
    thumbnailUrl: p.thumb ?? null,
  })),
  profileEvidence: null,
});

const founder = buildCreatorEvidence({
  platform: "instagram",
  displayName: "Greg",
  bio: "Owner @bloomsupps. How I built a supplement brand in my 20s.",
  snapshot: null,
  items: [],
});

describe("postIndex", () => {
  it("orders the creator's posts by views and gives them stable ids", () => {
    const posts = postIndex(
      snapshot([
        { id: "a", views: 4_600, caption: "Reading on the plane" },
        { id: "b", views: 263_000, caption: "Inside our warehouse on launch day", thumb: "https://cdn.example.com/b.jpg" },
        { id: "c", views: null, caption: "Untracked post" },
      ]),
      null
    );
    expect(posts.map(p => [p.ref, p.caption])).toEqual([
      ["P1", "Inside our warehouse on launch day"],
      ["P2", "Reading on the plane"],
      ["P3", "Untracked post"],
    ]);
    expect(posts[0]?.thumbnailUrl).toBe("https://cdn.example.com/b.jpg");
  });

  it("prefers the saved cover over an expiring provider thumbnail", () => {
    const snap = snapshot([{ id: "b", views: 10, caption: "Launch day", thumb: "https://scontent.cdninstagram.com/b.jpg" }]);
    snap.profileEvidence = {
      username: "founder",
      displayName: null,
      bio: null,
      category: null,
      cta: null,
      websiteUrl: null,
      captions: [],
      previewPosts: [{ id: "b", thumbnailUrl: "https://media.spyreels.ai/covers/b.jpg", viewCount: 10 }],
    };
    expect(postIndex(snap, snap.profileEvidence)[0]?.thumbnailUrl).toBe("https://media.spyreels.ai/covers/b.jpg");
  });

  it("uses the lookup covers before posts are fetched", () => {
    const posts = postIndex(null, {
      username: "founder",
      displayName: null,
      bio: null,
      category: null,
      cta: null,
      websiteUrl: null,
      captions: [],
      previewPosts: [
        { id: "x", thumbnailUrl: "https://cdn.example.com/x.jpg", viewCount: 10 },
        { id: "y", thumbnailUrl: "https://cdn.example.com/y.jpg", viewCount: 900 },
      ],
    });
    expect(posts.map(p => p.thumbnailUrl)).toEqual(["https://cdn.example.com/y.jpg", "https://cdn.example.com/x.jpg"]);
    expect(posts.every(p => p.caption === null)).toBe(true);
  });
});

describe("loadPostImages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("only fetches public https addresses", () => {
    expect(fetchableImageUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(fetchableImageUrl("http://cdn.example.com/a.jpg")).toBeNull();
    expect(fetchableImageUrl("https://localhost/a.jpg")).toBeNull();
    expect(fetchableImageUrl("https://169.254.169.254/latest")).toBeNull();
    expect(fetchableImageUrl(null)).toBeNull();
  });

  it("shrinks a real image and skips expired, non-image and failing links", async () => {
    const { default: sharp } = await import("sharp");
    const png = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#336699" } }).png().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/ok.png")) return new Response(png, { headers: { "content-type": "image/png" } });
      if (url.endsWith("/expired.jpg")) return new Response("gone", { status: 403 });
      if (url.endsWith("/page.html")) return new Response("<html>", { headers: { "content-type": "text/html" } });
      throw new Error("network down");
    }));
    const images = await loadPostImages([
      { ref: "P1", caption: null, views: null, thumbnailUrl: "https://cdn.example.com/ok.png" },
      { ref: "P2", caption: null, views: null, thumbnailUrl: "https://cdn.example.com/expired.jpg" },
      { ref: "P3", caption: null, views: null, thumbnailUrl: "https://cdn.example.com/page.html" },
      { ref: "P4", caption: null, views: null, thumbnailUrl: "https://cdn.example.com/down.jpg" },
    ]);
    expect(images.map(i => i.ref)).toEqual(["P1"]);
    expect(images[0]?.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    const meta = await sharp(Buffer.from(images[0]!.dataUrl.split(",")[1]!, "base64")).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(512);
  });
});

describe("post images switch", () => {
  it("is off unless explicitly enabled", async () => {
    expect(postImagesEnabled({})).toBe(false);
    expect(postImagesEnabled({ PERSONALIZATION_POST_IMAGES_ENABLED: "false" })).toBe(false);
    expect(postImagesEnabled({ PERSONALIZATION_POST_IMAGES_ENABLED: "1" })).toBe(false);
    expect(postImagesEnabled({ PERSONALIZATION_POST_IMAGES_ENABLED: " TRUE " })).toBe(true);
    expect(await noPostImages([{ ref: "P1", caption: null, views: null, thumbnailUrl: "https://cdn.example.com/a.jpg" }])).toEqual([]);
  });
});

describe("soft proof", () => {
  const ctx: PostContext = {
    posts: [
      { ref: "P1", caption: "Inside our warehouse on launch day", views: 263_000, thumbnailUrl: null },
      { ref: "P2", caption: "What I spent my first million on", views: 45_000, thumbnailUrl: null },
    ],
    images: [],
  };

  it("lists what a suggestion may cite", () => {
    const allowed = citableSources(founder.sources, ctx, "Show how a supplement brand is built.");
    expect([...allowed].sort()).toEqual(["P1", "P2", "bio", "goal"]);
  });

  it("drops uncited items only when enough cited ones remain", () => {
    const allowed = new Set(["P1", "bio"]);
    const items = [
      { item: "a", sources: ["p1"] },
      { item: "b", sources: ["bio"] },
      { item: "c", sources: [] },
      { item: "d", sources: ["P9"] },
    ];
    expect(keepCited(items, allowed, 2)).toEqual({ kept: ["a", "b"], dropped: 2 });
    expect(keepCited(items, allowed, 3)).toEqual({ kept: ["a", "b", "c", "d"], dropped: 0 });
  });

  it("drops an invented pillar that cites nothing and keeps the proven ones", () => {
    const allowed = citableSources(founder.sources, ctx, "Show how a supplement brand is built.");
    const r = parsePillarOutput(
      {
        pillars: [
          { title: "Warehouse Tours", serves: "Shows founders how a supplement brand really runs.", subtopics: [], sources: ["P1"] },
          { title: "Brand Building Lessons", serves: "Teaches founders what built the brand.", subtopics: [], sources: ["bio"] },
          { title: "Founder Money Moves", serves: "Shows what building a brand made possible.", subtopics: [], sources: ["P2"] },
          { title: "Developer Tools", serves: "Explains developer workflows for founders.", subtopics: [], sources: [] },
        ],
        confidence: "high",
      },
      founder,
      "Show how a supplement brand is built.",
      [],
      [],
      allowed
    );
    expect(r).toMatchObject({ ok: true, value: { uncitedDropped: 1 } });
    if (!r.ok) return;
    expect(r.value.pillars.map(p => p.title)).toEqual(["Warehouse Tours", "Brand Building Lessons", "Founder Money Moves"]);
    expect(r.value.subtopics).toHaveLength(3);
  });

  it("keeps every audience when none of them cite anything, so the step never ends empty", () => {
    const r = parseAudienceOutput(
      {
        audiences: [{ who: "Aspiring supplement brand founders", outcome: "launch a product brand", why: "They follow the build." }],
        confidence: "medium",
      },
      founder,
      "Show how a supplement brand is built.",
      [],
      citableSources(founder.sources, ctx, "x")
    );
    expect(r).toMatchObject({ ok: true, value: { uncitedDropped: 0 } });
  });

  it("shows the posts and the source rule in the pillar prompt", () => {
    const prompt = buildPillarPrompt(founder, "Show how a supplement brand is built.", [], [], [], ctx);
    expect(prompt.system).toContain("Every pillar needs at least one source");
    expect(prompt.user).toContain('"creator_posts"');
    expect(prompt.user).toContain("Inside our warehouse on launch day");
    expect(prompt.user).not.toContain("263");
  });
});
