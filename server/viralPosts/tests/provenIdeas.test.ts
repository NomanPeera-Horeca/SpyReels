import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  WINNER_MIN_MULTIPLE,
  cleanFormatPicks,
  dedupeSameIdea,
  defaultFormatPicks,
  recommendFormat,
} from "../ownWinners";
import { buildTreatmentBlock, treatmentKeepsSourceTopic } from "../../recreate/remakeTreatment";
import { readSameTopicVerdict } from "../../recreate/sameTopicCheck";
import { resolveRemakeRequest } from "../../remake/remakeRecords";
import { PRISM_FORMATS } from "../../../shared/remakeFormats";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("proven ideas", () => {
  it("needs 2x the creator's usual views", () => {
    expect(WINNER_MIN_MULTIPLE).toBe(2);
  });

  it("the same video on several platforms is one idea (best one kept)", () => {
    const posts = [
      { id: "1", caption: "Food cost control: the one number every owner needs #restaurants", publishedAt: "2026-10-01T10:00:00Z" },
      { id: "2", caption: "Food cost control - the ONE number every owner needs!", publishedAt: "2026-10-03T10:00:00Z" },
      { id: "3", caption: "Why my best cook almost quit", publishedAt: "2026-10-02T10:00:00Z" },
      { id: "4", caption: "Food cost control: the one number every owner needs", publishedAt: "2026-12-30T10:00:00Z" },
    ];
    expect(dedupeSameIdea(posts).map(p => p.id)).toEqual(["1", "3", "4"]);
  });

  it("recommends the first format not used yet on this idea", () => {
    const formats = [
      { id: "mistake", pitch: "a" },
      { id: "myth", pitch: "b" },
    ];
    expect(recommendFormat(formats, [])?.id).toBe("mistake");
    expect(recommendFormat(formats, ["mistake"])?.id).toBe("myth");
    expect(recommendFormat(formats, ["mistake", "myth"])).toBeNull();
  });

  it("keeps only known formats from the AI pick, no repeats, at most 4", () => {
    const raw = {
      formats: [
        { id: "mistake", pitch: "Same topic, new hook" },
        { id: "made_up", pitch: "x" },
        { id: "mistake", pitch: "dup" },
        { id: "myth", pitch: "" },
        { id: "story", pitch: "s" },
        { id: "list", pitch: "l" },
        { id: "how_to", pitch: "h" },
        { id: "result", pitch: "r" },
      ],
    };
    expect(cleanFormatPicks(raw).map(f => f.id)).toEqual(["mistake", "story", "list", "how_to"]);
    expect(cleanFormatPicks("nonsense")).toEqual([]);
    expect(defaultFormatPicks()).toHaveLength(4);
  });
});

describe("own-winner remake choices", () => {
  it("are refused unless it is the creator's own video", () => {
    expect(resolveRemakeRequest({ choice: "refresh_original" }).ok).toBe(false);
    expect(resolveRemakeRequest({ choice: "refresh_original" }, { ownWinnerAllowed: true })).toMatchObject({
      ok: true,
      topic: "SAME_TOPIC",
      treatment: { kind: "refresh" },
    });
  });

  it("Prism needs a known format", () => {
    expect(resolveRemakeRequest({ choice: "prism_format", prismFormat: "nope" }, { ownWinnerAllowed: true }).ok).toBe(false);
  });

  it("own-winner Use my idea needs an idea and keeps what made the video work", () => {
    expect(resolveRemakeRequest({ choice: "own_idea", idea: " " }, { ownWinnerAllowed: true }).ok).toBe(false);
    const r = resolveRemakeRequest({ choice: "own_idea", idea: "for cafes" }, { ownWinnerAllowed: true });
    expect(r).toMatchObject({ ok: true, topic: "for cafes", treatment: { kind: "own_idea" } });
    expect(buildTreatmentBlock({ kind: "own_idea" })).toMatch(/Keep what made it work/);
  });

  it("changing the Prism format changes the treatment, not the source topic", () => {
    const a = resolveRemakeRequest({ choice: "prism_format", prismFormat: "mistake" }, { ownWinnerAllowed: true });
    const b = resolveRemakeRequest({ choice: "prism_format", prismFormat: "story" }, { ownWinnerAllowed: true });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.topic).toBe("SAME_TOPIC");
    expect(b.topic).toBe(a.topic);
    const ta = buildTreatmentBlock(a.treatment);
    const tb = buildTreatmentBlock(b.treatment);
    expect(ta).not.toBe(tb);
    expect(ta).toContain("Mistake breakdown");
    expect(tb).toContain("Story");
    for (const t of [ta, tb]) {
      expect(t).toContain("Keep the EXACT same topic");
      expect(t).toContain("[add your real result here]");
    }
  });

  it("no treatment block for other remakes (their prompt is unchanged)", () => {
    expect(buildTreatmentBlock(null)).toBe("");
    expect(buildTreatmentBlock({ kind: "prism", formatId: "unknown" })).toBe("");
  });

  it("Prism and Refresh are checked to stay on the source topic; the check fails open", () => {
    expect(treatmentKeepsSourceTopic({ kind: "prism", formatId: "myth" })).toBe(true);
    expect(treatmentKeepsSourceTopic({ kind: "refresh" })).toBe(true);
    expect(treatmentKeepsSourceTopic({ kind: "own_idea" })).toBe(false);
    expect(treatmentKeepsSourceTopic(null)).toBe(false);
    expect(readSameTopicVerdict('{"sameTopic": false}')).toBe(false);
    expect(readSameTopicVerdict('{"sameTopic": true}')).toBe(true);
    expect(readSameTopicVerdict("garbage")).toBe(true);
  });

  it("every Prism format has a name, a short line and how-to", () => {
    expect(PRISM_FORMATS).toHaveLength(10);
    for (const f of PRISM_FORMATS) expect(f.label && f.short && f.how).toBeTruthy();
  });
});

describe("wiring", () => {
  it("own-winner choices need OWN_WINNERS and the creator's own video", () => {
    const router = read("server/routers/recreateRouter.ts");
    expect(router).toContain("ownWinnersEnabled()");
    expect(router).toContain("isOwnWinnerVideo(");
  });
  it("Home: 3 idea cards, proven ideas before videos, Remix scrolls there", () => {
    const home = read("client/src/components/home-v2/HomeV2Page.tsx");
    expect(home).toContain(".slice(0, 3)");
    expect(home).toContain("styles.threeUp");
    expect(home.indexOf('data-testid="home-proven-ideas"')).toBeLessThan(home.indexOf('aria-labelledby="home-v2-videos"'));
    expect(home).toContain("onRemix={provenIdeas.length > 0 ? scrollToProven : undefined}");
    expect(home).toContain("scrollIntoView");
    expect(home).not.toContain("PrismRemakeDialog");
    // Proven ideas use exactly the same grid and card as "Viral Videos for you".
    const proven = home.slice(home.indexOf('data-testid="home-proven-ideas"'), home.indexOf('aria-labelledby="home-v2-videos"'));
    expect(proven).toContain("styles.videoGrid");
    expect(proven).not.toMatch(/subline|metricsOverride|ownWinner\b|provenGrid/);
  });
});
