import { describe, expect, it } from "vitest";
import { formatIdeaScriptErrorForUser } from "./ideaScriptErrors";

const ANTHROPIC_SCHEMA_REJECTION =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"tools.0.custom: For \'array\' type, \'minItems\' values other than 0 or 1 are not supported (got: [2, 5])"},"request_id":"req_test"}';

describe("formatIdeaScriptErrorForUser", () => {
  it("uses carousel plan wording for Studio planning failures", () => {
    const message = formatIdeaScriptErrorForUser(
      ANTHROPIC_SCHEMA_REJECTION,
      "carousel"
    );
    expect(message).toBe(
      "Something went wrong while creating your carousel plan. Tap Retry to try again."
    );
    expect(message).not.toContain("writing your script");
  });

  it("keeps script wording for non-carousel generation failures", () => {
    const message = formatIdeaScriptErrorForUser(
      ANTHROPIC_SCHEMA_REJECTION,
      "script"
    );
    expect(message).toBe(
      "Something went wrong while writing your script. Tap Retry to try again."
    );
    expect(message).not.toContain("carousel plan");
  });
});
