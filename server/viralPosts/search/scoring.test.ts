import { describe, expect, it } from "vitest";
import {
  diversify,
  orderMatches,
  performanceScore,
  prepareField,
  queryTerms,
  scoreDoc,
  stem,
  words,
  type SearchDoc,
  type SearchField,
} from "./scoring";
import { toIndexedDoc } from "./librarySearch";

let nextId = 1;
const doc = (fields: Partial<Record<SearchField, string>>, extra: Partial<SearchDoc> = {}) => {
  const id = nextId++;
  const d: SearchDoc = {
    id,
    platform: "tiktok",
    creatorHandle: `creator${id}`,
    fields,
    embedding: null,
    views: 1000,
    multiple: 1,
    status: "normal",
    publishedAt: null,
    ...extra,
  };
  const prepared = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, prepareField(v ?? "")]));
  return { d, prepared };
};
const score = (q: string, x: ReturnType<typeof doc>, queryEmbedding: number[] | null = null) =>
  scoreDoc({ doc: x.d, prepared: x.prepared, terms: queryTerms(q), queryEmbedding });

describe("reading the words", () => {
  it("stems plurals and -ing", () => {
    expect(stem("tips")).toBe("tip");
    expect(stem("cooking")).toBe("cook");
    expect(stem("recipes")).toBe("recipe");
    expect(stem("glass")).toBe("glass");
  });
  it("splits hashtags into words", () => {
    expect(words("#KitchenTips and #meal_prep")).toEqual(["kitchen", "tips", "and", "meal", "prep"]);
  });
  it("drops filler words from the query", () => {
    expect(queryTerms("how to do the best kitchen tips")).toEqual(["best", "kitchen", "tip"]);
  });
});

describe("kitchen tips (the example)", () => {
  it("finds a video where someone SAYS it, even with an emoji caption", () => {
    const v = doc({ caption: "wait for it 😂", spoken: "okay here are my three kitchen tips that changed everything" });
    const s = score("kitchen tips", v);
    expect(s?.tier).toBe("strong");
    expect(s?.phrase).toBe(true);
    expect(s?.matchedIn[0]).toBe("spoken");
  });
  it("finds it in hashtags and in what the video shows", () => {
    expect(score("kitchen tips", doc({ hashtags: "#kitchentips #KitchenTips" }))?.tier).toBe("strong");
    expect(score("kitchen tips", doc({ summary: "A chef shares quick kitchen tips for home cooks" }))?.tier).toBe("strong");
  });
  it("the whole phrase beats the words far apart", () => {
    const phrase = score("kitchen tips", doc({ caption: "5 kitchen tips" }))!;
    const apart = score("kitchen tips", doc({ caption: "tips for your new kitchen" }))!;
    expect(phrase.relevance).toBeGreaterThan(apart.relevance);
  });
  it("ignores videos that don't mention it", () => {
    expect(score("kitchen tips", doc({ caption: "my morning gym routine", spoken: "let's go leg day" }))).toBeNull();
  });
  it("a creator name alone is not a match", () => {
    expect(score("kitchen", doc({ creator: "kitchenqueen" }))).toBeNull();
  });
});

describe("match first, then performance", () => {
  it("an off-topic viral video never beats an on-topic one", () => {
    const onTopic = doc({ caption: "3 kitchen tips every cook should know" }, { views: 2_000, multiple: 1.2 });
    const halfTopic = doc({ caption: "kitchen renovation reveal" }, { views: 9_000_000, multiple: 40, status: "viral" });
    const ordered = orderMatches([score("kitchen tips", halfTopic)!, score("kitchen tips", onTopic)!], "best");
    expect(ordered[0].doc.id).toBe(onTopic.d.id);
  });
  it("among equally good matches, the more viral one comes first", () => {
    const small = doc({ caption: "kitchen tips" }, { views: 5_000, multiple: 1 });
    const viral = doc({ caption: "kitchen tips" }, { views: 3_000_000, multiple: 12, status: "viral" });
    const ordered = orderMatches([score("kitchen tips", small)!, score("kitchen tips", viral)!], "best");
    expect(ordered[0].doc.id).toBe(viral.d.id);
  });
  it("close-meaning-only matches come after word matches", () => {
    const e = [1, 0, 0];
    const meaningOnly = doc({ caption: "cooking hacks that save time" }, { embedding: [0.95, 0.31, 0], views: 9_000_000, multiple: 30 });
    const wordHit = doc({ caption: "kitchen tips" }, { embedding: [0.3, 0.95, 0] });
    const a = score("kitchen tips", meaningOnly, e)!;
    const b = score("kitchen tips", wordHit, e)!;
    expect(a.tier).toBe("meaning");
    expect(orderMatches([a, b], "best")[0].doc.id).toBe(wordHit.d.id);
  });
  it("other sorts reorder good matches only", () => {
    const a = doc({ caption: "kitchen tips" }, { views: 10 });
    const b = doc({ caption: "kitchen tips for beginners" }, { views: 900 });
    expect(orderMatches([score("kitchen tips", a)!, score("kitchen tips", b)!], "views")[0].doc.id).toBe(b.d.id);
  });
  it("performance grows with virality and views", () => {
    expect(performanceScore({ views: 1_000_000, multiple: 10, status: "viral" })).toBeGreaterThan(
      performanceScore({ views: 1_000, multiple: 1, status: "normal" })
    );
  });
});

describe("variety", () => {
  it("a creator's 3rd video moves behind other creators", () => {
    const m = (h: string) => ({ doc: { platform: "tiktok", creatorHandle: h } });
    const out = diversify([m("a"), m("a"), m("a"), m("b")]);
    expect(out.map(x => x.doc.creatorHandle)).toEqual(["a", "a", "b", "a"]);
  });
});

describe("index rows", () => {
  it("turns a library row into a searchable video", () => {
    const { doc: d, prepared } = toIndexedDoc({
      id: 7,
      platform: "instagram",
      sourceUrl: "https://instagram.com/reel/x",
      caption: "Hi",
      hashtags: '["KitchenTips"]',
      creatorHandle: "@Chef",
      transcript: "my kitchen tips",
      summary: null,
      embedding: "[0.1,0.2]",
      views: "1200",
      multiple: "3.5",
      status: "viral",
      publishedAt: "2026-11-01",
    });
    expect(d).toMatchObject({ id: 7, creatorHandle: "Chef", views: 1200, multiple: 3.5, status: "viral" });
    expect(Array.from(d.embedding ?? [])).toEqual([expect.closeTo(0.1, 5), expect.closeTo(0.2, 5)]);
    expect(prepared.hashtags?.terms.has("kitchen")).toBe(true);
    expect(prepared.summary).toBeUndefined();
  });
});
