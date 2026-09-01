import { describe, expect, it } from "vitest";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";
import { errorContextForOperation } from "./llm";

const ANTHROPIC_SCHEMA_REJECTION =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"tools.0.custom: compiled grammar is too large"},"request_id":"req_test"}';

function userFacingMessage(operation?: string): string {
  return formatIdeaScriptErrorForUser(
    ANTHROPIC_SCHEMA_REJECTION,
    errorContextForOperation(operation)
  );
}

describe("errorContextForOperation", () => {
  it("uses carousel wording for copy_generation", () => {
    expect(errorContextForOperation("copy_generation")).toBe("carousel");
    expect(userFacingMessage("copy_generation")).toBe(
      "Something went wrong while creating your carousel plan. Tap Retry to try again."
    );
    expect(userFacingMessage("copy_generation")).not.toContain(
      "writing your script"
    );
  });

  it("uses carousel wording for angle_generation", () => {
    expect(errorContextForOperation("angle_generation")).toBe("carousel");
    expect(userFacingMessage("angle_generation")).toBe(
      "Something went wrong while creating your carousel plan. Tap Retry to try again."
    );
    expect(userFacingMessage("angle_generation")).not.toContain(
      "writing your script"
    );
  });

  it("keeps script wording for normal script operations", () => {
    expect(errorContextForOperation()).toBe("script");
    expect(errorContextForOperation("script_generation")).toBe("script");
    expect(userFacingMessage()).toBe(
      "Something went wrong while writing your script. Tap Retry to try again."
    );
    expect(userFacingMessage("script_generation")).toBe(
      "Something went wrong while writing your script. Tap Retry to try again."
    );
    expect(userFacingMessage()).not.toContain("carousel plan");
  });
});
