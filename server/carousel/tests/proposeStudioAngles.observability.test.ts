import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANGLE_GENERATION_FAILED } from "../angleGenerationObservability";

vi.mock("../generateCarouselAngles", () => ({
  generateCarouselAngles: vi.fn(),
}));

import { generateCarouselAngles } from "../generateCarouselAngles";
import { proposeStudioAngles } from "../proposeStudioAngles";

const mockedGenerate = vi.mocked(generateCarouselAngles);

const SECRET_SOURCE =
  "UNIQUE_SECRET_SOURCE_TEXT_about_my_private_product_recipe";

function flattenLogCalls(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls
    .map((args) =>
      args
        .map((arg) =>
          typeof arg === "string" ? arg : JSON.stringify(arg)
        )
        .join(" ")
    )
    .join("\n");
}

describe("proposeStudioAngles observability", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedGenerate.mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the original error before wrapping it as a TRPC error", async () => {
    const original = Object.assign(
      new Error("tools.0.custom: compiled grammar is too large"),
      { name: "BadRequestError", status: 400, requestID: "req_wrap" }
    );
    mockedGenerate.mockRejectedValueOnce(original);

    let thrown: unknown;
    try {
      await proposeStudioAngles({
        sourceContent: SECRET_SOURCE,
        niche: "restaurant owners",
        brandVoice: "Keep this private voice",
        correlationId: "corr-wrap",
        entryPoint: "carouselStudio.generateFromInput",
      });
    } catch (err) {
      thrown = err;
    }

    expect(errorSpy).toHaveBeenCalled();
    const firstFail = errorSpy.mock.calls.find(
      (call) => call[0] === ANGLE_GENERATION_FAILED
    );
    expect(firstFail).toBeDefined();
    const payload = firstFail?.[1] as Record<string, unknown>;
    expect(payload.errorMessage).toBe(
      "tools.0.custom: compiled grammar is too large"
    );
    expect(payload.errorName).toBe("BadRequestError");
    expect(payload.statusCode).toBe(400);
    expect(payload.providerRequestId).toBe("req_wrap");
    expect(payload.correlationId).toBe("corr-wrap");

    const dumped = flattenLogCalls(errorSpy);
    expect(dumped).not.toContain(SECRET_SOURCE);
    expect(dumped).not.toContain("Keep this private voice");
    expect(dumped).not.toContain("restaurant owners");

    expect(thrown).toBeInstanceOf(TRPCError);
    const trpc = thrown as TRPCError;
    expect(trpc.code).toBe("INTERNAL_SERVER_ERROR");
    expect(trpc.message).toBe(original.message);
    expect(trpc).not.toBe(original);
  });

  it("forwards requiredValidBriefs to generateCarouselAngles", async () => {
    mockedGenerate.mockResolvedValueOnce({
      briefs: [],
      formatRecommendation: null,
    });

    await proposeStudioAngles({
      sourceContent: SECRET_SOURCE,
      correlationId: "corr-required",
      requiredValidBriefs: 1,
    });

    expect(mockedGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceContent: SECRET_SOURCE,
        correlationId: "corr-required",
        requiredValidBriefs: 1,
      })
    );
  });

  it("returns generateCarouselAngles results unchanged on success", async () => {
    const proposal = {
      briefs: [{ title: "Kept brief" }],
      formatRecommendation: null,
    } as never;
    mockedGenerate.mockResolvedValueOnce(proposal);

    const result = await proposeStudioAngles({
      sourceContent: SECRET_SOURCE,
      correlationId: "corr-ok",
    });

    expect(result).toBe(proposal);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(mockedGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceContent: SECRET_SOURCE,
        correlationId: "corr-ok",
        requiredValidBriefs: undefined,
      })
    );
  });
});
