import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("AiCoach analyze onError fallback", () => {
  it("still writes the script after analyze fails", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "AiCoach.tsx"), "utf8");
    const start = source.indexOf("const analyzeMutation");
    const end = source.indexOf("const refineMutation");
    const onErrorBlock = source.slice(start, end);

    expect(onErrorBlock).toContain("onError:");
    expect(onErrorBlock).toContain(
      'toast.message("Could not analyze your idea. Writing your script anyway...")'
    );
    expect(onErrorBlock).toContain('setPhase("generating")');
    expect(onErrorBlock).toContain(
      "generateMutation.mutate(buildGenerateInput({ clarifications: [] }))"
    );
  });
});
