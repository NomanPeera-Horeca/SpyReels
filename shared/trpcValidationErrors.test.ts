import { describe, expect, it } from "vitest";
import {
  formatTrpcValidationMessage,
  sanitizePublicTrpcMessage,
} from "./trpcValidationErrors";

describe("sanitizePublicTrpcMessage", () => {
  it("redacts drizzle Failed query payloads", () => {
    expect(
      sanitizePublicTrpcMessage(
        "Failed query: UPDATE saved_reels SET platform = ?, sourceId = ? WHERE workspaceId = ? params: tiktok,7690,ws,9,44831"
      )
    ).toBe("Something went wrong. Please try again.");
  });

  it("redacts unknown column and duplicate entry text", () => {
    expect(
      sanitizePublicTrpcMessage("Unknown column 'platform' in 'field list'")
    ).toBe("Something went wrong. Please try again.");
    expect(
      sanitizePublicTrpcMessage(
        "Duplicate entry 'ws-9-tiktok-7690' for key 'uniq_saved_reels'"
      )
    ).toBe("Something went wrong. Please try again.");
  });

  it("keeps ordinary product messages", () => {
    expect(sanitizePublicTrpcMessage("Post not found")).toBe("Post not found");
    expect(sanitizePublicTrpcMessage("Could not save")).toBe("Could not save");
  });
});

describe("formatTrpcValidationMessage", () => {
  it("still formats Zod too_big idea errors", () => {
    const msg = formatTrpcValidationMessage(
      JSON.stringify([
        {
          code: "too_big",
          type: "string",
          maximum: 500,
          path: ["idea"],
          message: "String must contain at most 500 character(s)",
        },
      ])
    );
    expect(msg.toLowerCase()).toContain("too long");
  });

  it("redacts SQL that slips past Zod formatting", () => {
    expect(
      formatTrpcValidationMessage(
        "Failed query: INSERT INTO saved_reels (platform) VALUES (?)"
      )
    ).toBe("Something went wrong. Please try again.");
  });
});
