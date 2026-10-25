import { describe, expect, it } from "vitest";
import { recentMediaFromGraphUser } from "../../instagram";
import { buildCreatorEvidence, verbatimCta } from "../intelligence/evidence";
import { firstVisibleDelayMs, msSinceConfirm } from "../intelligence/recommendationService";
import { catalogNiche } from "../intelligence/profileBasics";
import { persistedPreviewPosts, previewPostsFromEvidence, profileEvidenceFromPreview, publicWebsiteUrl } from "./profileEvidence";

describe("profile evidence from lookup", () => {
  it("keeps the caption that arrived in the profile payload", () => {
    const media = recentMediaFromGraphUser({
      edge_owner_to_timeline_media: {
        edges: [
          {
            node: {
              shortcode: "abc",
              thumbnail_src: "https://cdn.example/a.jpg",
              edge_media_to_caption: { edges: [{ node: { text: "DM for a quote on ovens" } }] },
            },
          },
          {
            node: {
              shortcode: "no-thumb",
              edge_media_to_caption: { edges: [{ node: { text: "Wholesale catalog for cafes" } }] },
            },
          },
        ],
      },
    });
    expect(media.map(item => item.caption)).toEqual([
      "DM for a quote on ovens",
      "Wholesale catalog for cafes",
    ]);
  });

  it("uses image_versions2 when the profile node has no thumbnail_src", () => {
    const media = recentMediaFromGraphUser({
      edge_owner_to_timeline_media: {
        edges: [
          {
            node: {
              shortcode: "cover",
              image_versions2: { candidates: [{ url: "https://cdn.example/cover.jpg", width: 640 }] },
            },
          },
        ],
      },
    });
    expect(media).toEqual([
      expect.objectContaining({
        shortcode: "cover",
        thumbnailUrl: "https://cdn.example/cover.jpg",
      }),
    ]);
  });

  it("keeps category, website, CTA and captions without inventing a CTA", () => {
    const evidence = profileEvidenceFromPreview({
      platform: "instagram",
      handle: "wildlife",
      displayName: "Wildlife Photographer",
      bio: "I photograph wild animals.\nBook a workshop via the link.",
      category: "Photographer",
      externalUrl: "https://example.com/workshops",
      avatarUrl: null,
      bannerUrl: null,
      isVerified: false,
      isPrivate: false,
      postCount: 3,
      followerCount: 10,
      followingCount: 1,
      likeCount: null,
      videoCount: null,
      recentPosts: [{ id: "a", thumbnailUrl: "https://cdn.example/a.jpg", viewCount: 5, caption: "Dawn in the marsh" }],
      lookupCaptions: ["Wholesale catalog for cafes"],
    });
    expect(evidence).toMatchObject({
      username: "wildlife",
      displayName: "Wildlife Photographer",
      category: "Photographer",
      websiteUrl: "https://example.com/workshops",
      cta: "Book a workshop via the link.",
    });
    expect(evidence.captions).toEqual(["Wholesale catalog for cafes", "Dawn in the marsh"]);
    expect(evidence.previewPosts).toEqual([
      { id: "a", thumbnailUrl: "https://cdn.example/a.jpg", viewCount: 5 },
    ]);
    expect(
      previewPostsFromEvidence({
        ...evidence,
        previewPosts: persistedPreviewPosts({
          platform: "instagram",
          handle: "wildlife",
          displayName: null,
          bio: null,
          category: null,
          externalUrl: null,
          avatarUrl: null,
          bannerUrl: null,
          isVerified: false,
          isPrivate: false,
          postCount: null,
          followerCount: null,
          followingCount: null,
          likeCount: null,
          videoCount: null,
          recentPosts: [
            { id: "a", thumbnailUrl: "https://cdn.example/a.jpg", viewCount: 5, isPinned: true },
            { id: "gone", thumbnailUrl: null, viewCount: null },
          ],
        }),
      })
    ).toEqual([{ id: "a", thumbnailUrl: "https://cdn.example/a.jpg", viewCount: 5, isPinned: true }]);
    expect(verbatimCta("I photograph wild animals.")).toBeNull();
    expect(publicWebsiteUrl("javascript:alert(1)")).toBeNull();
  });

  it("lets suggestions read lookup facts before any post exists", () => {
    const built = buildCreatorEvidence({
      platform: "instagram",
      displayName: "Wildlife Photographer",
      bio: null,
      snapshot: null,
      items: [],
      profileEvidence: {
        username: "wildlife",
        displayName: "Wildlife Photographer",
        bio: null,
        category: "Photographer",
        cta: null,
        websiteUrl: "https://example.com/",
        captions: ["Dawn in the marsh", "Tracking a fox", "Hide setup"],
      },
    });
    expect(built.strength).not.toBe("none");
    expect(built.sources).toEqual(expect.arrayContaining(["display_name", "category", "captions"]));
    expect(built.sources).not.toContain("website");
    expect(built.websiteUrlOnly).toBe("https://example.com/");
    expect(built.snippets.some(snippet => snippet.text === "Dawn in the marsh")).toBe(true);
  });

  it("adds stored website offers and calls to action without a new fetch", () => {
    const built = buildCreatorEvidence({
      platform: "instagram",
      displayName: "Cafe Supply",
      bio: "Commercial kitchen equipment.",
      snapshot: null,
      items: [],
      profileEvidence: {
        username: "cafe",
        displayName: "Cafe Supply",
        bio: "Commercial kitchen equipment.",
        category: null,
        cta: "DM for a quote.",
        websiteUrl: "https://example.com/menu",
        captions: [],
        website: {
          url: "https://example.com/menu",
          fetchedAt: "2026-10-24T16:00:00.000Z",
          title: "Cafe Supply Co",
          offers: ["Ovens and prep tables"],
          businessModel: "b2b",
          customers: ["Restaurant owners"],
          callsToAction: ["Book a showroom visit"],
          goalEvidence: ["Helping cafes fill more covers"],
        },
      },
    });
    expect(built.sources).toContain("website");
    expect(built.sources).toContain("cta");
    expect(built.snippets.map(snippet => snippet.text)).toEqual(
      expect.arrayContaining([
        "Ovens and prep tables",
        "Book a showroom visit",
        "Restaurant owners",
        "Helping cafes fill more covers",
      ])
    );
    expect(built.commercialSignals).toBe(true);
  });

  it("still treats a supplier as a business, not a restaurant operator", () => {
    const text = [
      "Cafe Supply",
      "Commercial kitchen equipment for restaurants. DM for a quote.",
      "Product/service",
      "How to spec a combi oven",
    ].join("\n");
    expect(catalogNiche(text)).toEqual({
      slug: "business-entrepreneurship",
      label: "Business & Entrepreneurship",
    });
  });

  it("measures time from confirmation to a saved suggestion", () => {
    const confirmed = new Date("2026-10-22T13:00:00.000Z");
    expect(msSinceConfirm(confirmed, confirmed.getTime() + 12_000)).toBe(12_000);
    expect(msSinceConfirm(null, Date.now())).toBeNull();
  });
});
