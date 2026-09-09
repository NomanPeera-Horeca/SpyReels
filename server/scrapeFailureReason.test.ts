import { describe, expect, it } from "vitest";
import { classifyScrapeFailureMessage } from "./scrapeFailureReason";

describe("classifyScrapeFailureMessage", () => {
  it("classifies confirmed missing handles", () => {
    expect(
      classifyScrapeFailureMessage(
        'User "@sista.media_" not found. Please check the username and try again.'
      )
    ).toBe("handle_not_found");
  });

  it("does not treat provider resolution failures as handle_not_found", () => {
    expect(
      classifyScrapeFailureMessage(
        "Instagram could not resolve @sista.media_ right now. This is usually temporary. Please try again in a few minutes."
      )
    ).toBe("instagram_rate_limited");
    expect(
      classifyScrapeFailureMessage(
        "We couldn't load @owner's profile right now. Please try again in a few minutes."
      )
    ).toBe("instagram_rate_limited");
  });

  it("does not treat a generic not-accessible message as handle_not_found", () => {
    expect(
      classifyScrapeFailureMessage(
        'User "@owner" not found or the profile is not accessible.'
      )
    ).toBe("unknown");
  });

  it("does not treat restricted media as handle_not_found or rate-limited", () => {
    expect(
      classifyScrapeFailureMessage(
        "Instagram is restricting access to this account's media. We found the creator, but can't retrieve their reels right now."
      )
    ).toBe("unknown");
  });

  it("keeps private and rate-limit classifications", () => {
    expect(
      classifyScrapeFailureMessage("The account @owner is private. Only public accounts can be analyzed.")
    ).toBe("account_private");
    expect(
      classifyScrapeFailureMessage("Instagram rate limit reached. Please wait a few minutes and try again.")
    ).toBe("instagram_rate_limited");
  });
});
