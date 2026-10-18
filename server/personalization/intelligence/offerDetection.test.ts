/**
 * Commercial-intent detection, measured on HELD-OUT sentences (never used to
 * tune the patterns; the 30 evaluation fixtures were).
 *
 * Design under test (two layers):
 * 1. detectCommercialSignals: regex fast path. Must be PRECISE: no false
 *    positives. It is allowed to miss phrasing it has never seen.
 * 2. Verified offer quote: the model may unlock a business goal only by
 *    quoting the creator's own words; offerQuoteIsVerbatim requires the
 *    quote to be verbatim in bio/brand/name AND to contain offer language.
 *    Must give RECALL on real offers and be impossible to satisfy on
 *    non-commercial bios (no phrase anywhere in them passes).
 */
import { describe, expect, it } from "vitest";
import {
  buildCreatorEvidence,
  detectCommercialSignals,
  offerQuoteIsVerbatim,
} from "./evidence";

const POSITIVE: Array<{ bio: string; name?: string; quote: string }> = [
  { bio: "Now taking new clients for spring", quote: "taking new clients" },
  { bio: "Commissions open! Pet portraits", quote: "Commissions open" },
  {
    bio: "Personal trainer. Online and in-person sessions.",
    quote: "in-person sessions",
  },
  { bio: "Handmade candles. Etsy shop below.", quote: "Etsy shop below" },
  { bio: "Tattoo artist. Walk-ins welcome.", quote: "Walk-ins welcome" },
  {
    bio: "Photographer for weddings and portraits. Inquire for dates.",
    quote: "Inquire for dates",
  },
  {
    bio: "Hiring baristas! Apply in store",
    name: "Corner Coffee",
    quote: "Apply in store",
  },
  { bio: "Lawyer. Free case review.", quote: "Free case review" },
];

const NEGATIVE: string[] = [
  "Math memes for nerds",
  "I review books I love",
  "Gamer. Streaming most nights.",
  "Amazon storefront in bio",
  "Dad of 3. Bad jokes daily.",
  "Talking about business news every morning",
  "Nurse sharing my 12 hour shifts",
];

const evidenceFor = (bio: string, name: string | null = null) =>
  buildCreatorEvidence({
    platform: "instagram",
    displayName: name,
    bio,
    snapshot: null,
    items: [],
  });

/** Every contiguous 2..8-word window of the bio: everything a model could quote. */
function windows(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    for (let len = 2; len <= 8 && i + len <= words.length; len++)
      out.push(words.slice(i, i + len).join(" "));
  }
  return out;
}

describe("layer 1: regex fast path is precise on held-out sentences", () => {
  it("never flags a non-commercial bio", () => {
    const falsePositives = NEGATIVE.filter(bio =>
      detectCommercialSignals({
        bio,
        brandDescription: null,
        displayName: null,
      })
    );
    expect(falsePositives).toEqual([]);
  });
});

describe("layer 2: verified quote gives recall without a back door", () => {
  it("every real offer can be unlocked by quoting the creator's own words", () => {
    const missed = POSITIVE.filter(
      p => !offerQuoteIsVerbatim(p.quote, evidenceFor(p.bio, p.name ?? null))
    );
    expect(missed).toEqual([]);
  });

  it("no phrase anywhere in a non-commercial bio can unlock a business goal", () => {
    const leaks = NEGATIVE.flatMap(bio =>
      windows(bio)
        .filter(w => offerQuoteIsVerbatim(w, evidenceFor(bio)))
        .map(w => `${bio} -> "${w}"`)
    );
    expect(leaks).toEqual([]);
  });

  it("an invented quote fails even if it sounds like an offer", () => {
    expect(
      offerQuoteIsVerbatim(
        "Book a free consultation",
        evidenceFor("Slow travel diaries from small towns.")
      )
    ).toBe(false);
  });

  it("a real but non-offer phrase fails ('slow travel')", () => {
    expect(
      offerQuoteIsVerbatim(
        "slow travel diaries",
        evidenceFor("Slow travel diaries from small towns.")
      )
    ).toBe(false);
  });

  it("captions are never a source for the quote (only bio, brand description, name)", () => {
    const e = buildCreatorEvidence({
      platform: "instagram",
      displayName: null,
      bio: "Gaming clips",
      snapshot: {
        version: 1,
        platform: "instagram",
        handle: "x",
        followerCount: null,
        windowStart: "",
        windowEnd: "",
        posts: [
          {
            postId: "1",
            url: null,
            publishedAt: null,
            views: 1,
            likes: null,
            comments: null,
            durationSec: null,
            caption: "taking new clients lol jk",
          },
        ],
      },
      items: [],
    });
    expect(offerQuoteIsVerbatim("taking new clients", e)).toBe(false);
  });
});
