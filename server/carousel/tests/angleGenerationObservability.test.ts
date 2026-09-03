import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANGLE_GENERATION_COMPLETED,
  ANGLE_GENERATION_FAILED,
  ANGLE_GENERATION_STARTED,
  ANGLE_GENERATION_SUBSTAGE_COMPLETED,
  GENERATE_FROM_INPUT_FAILED,
  INVOKE_LLM_LOGICAL_FAILED,
  INVOKE_LLM_LOGICAL_STARTED,
  extractProviderErrorFields,
  logAngleGenerationCompleted,
  logAngleGenerationFailed,
  logAngleGenerationStarted,
  logAngleInvokeLlmEvent,
  logAngleSubstageCompleted,
  logGenerateFromInputCaughtError,
  wrapProposeStudioAnglesError,
} from "../angleGenerationObservability";

const SECRET_SOURCE =
  "UNIQUE_SECRET_SOURCE_TEXT_about_my_private_product_recipe";
const SECRET_PROMPT = "SYSTEM_PROMPT_DO_NOT_LOG write a carousel about secrets";

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

describe("extractProviderErrorFields", () => {
  it("extracts status and request ID from Anthropic-style properties", () => {
    const err = Object.assign(new Error("tools.0.custom: compiled grammar is too large"), {
      name: "BadRequestError",
      status: 400,
      requestID: "req_abc123",
    });
    expect(extractProviderErrorFields(err)).toMatchObject({
      errorName: "BadRequestError",
      errorMessage: "tools.0.custom: compiled grammar is too large",
      statusCode: 400,
      providerRequestId: "req_abc123",
    });
    expect(extractProviderErrorFields(err).stack).toContain(
      "compiled grammar is too large"
    );
  });

  it("extracts status and request ID from an Anthropic JSON message", () => {
    const message =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"tools.0.custom: compiled grammar is too large"},"request_id":"req_test"}';
    const fields = extractProviderErrorFields(message);
    expect(fields.statusCode).toBe(400);
    expect(fields.providerRequestId).toBe("req_test");
    expect(fields.errorMessage).toBe(message);
  });

  it("extracts request ID from headers when present", () => {
    const err = Object.assign(new Error("overloaded_error"), {
      status: 529,
      headers: { "request-id": "req_from_headers" },
    });
    expect(extractProviderErrorFields(err)).toMatchObject({
      statusCode: 529,
      providerRequestId: "req_from_headers",
    });
  });
});

describe("angle generation log payloads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start and completion logs omit source content and prompts", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logAngleGenerationStarted({
      entryPoint: "carouselStudio.generateFromInput",
      correlationId: "corr-1",
      sourceCharacterCount: SECRET_SOURCE.length,
      hasNicheOverride: true,
      hasBrandVoice: false,
      timestamp: "2026-09-01T12:00:00.000Z",
    });
    logAngleGenerationCompleted({
      correlationId: "corr-1",
      durationMs: 12,
      rawCandidateCount: 3,
      normalizedCandidateCount: 3,
      acceptedSemanticCandidateCount: 3,
      repairRan: false,
    });

    const dumped = flattenLogCalls(info);
    expect(dumped).toContain(ANGLE_GENERATION_STARTED);
    expect(dumped).toContain(ANGLE_GENERATION_COMPLETED);
    expect(dumped).toContain("corr-1");
    expect(dumped).toContain('"sourceCharacterCount":');
    expect(dumped).not.toContain(SECRET_SOURCE);
    expect(dumped).not.toContain(SECRET_PROMPT);
    expect(dumped).not.toContain("prompt");
    expect(info.mock.calls[0]?.[1]).not.toHaveProperty("sourceContent");
    expect(info.mock.calls[0]?.[1]).not.toHaveProperty("prompt");
  });

  it("substage logs report counts and tokens without source text", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logAngleSubstageCompleted({
      correlationId: "corr-sub",
      substage: "compact",
      inputCharacterCount: 2100,
      inputTokens: 800,
      outputTokens: 400,
      durationMs: 22000,
      rawCandidateCount: 3,
      validCompactCandidateCount: 3,
    });
    logAngleSubstageCompleted({
      correlationId: "corr-sub",
      substage: "expansion",
      inputCharacterCount: 2800,
      inputTokens: 1100,
      outputTokens: 1500,
      durationMs: 30000,
      firstPassValid: true,
      repairRan: false,
    });

    const dumped = flattenLogCalls(info);
    expect(dumped).toContain(ANGLE_GENERATION_SUBSTAGE_COMPLETED);
    expect(dumped).toContain('"substage":"compact"');
    expect(dumped).toContain('"validCompactCandidateCount":3');
    expect(dumped).toContain('"firstPassValid":true');
    expect(dumped).toContain('"repairRan":false');
    expect(dumped).not.toContain(SECRET_SOURCE);
    expect(dumped).not.toContain(SECRET_PROMPT);
    expect(dumped).not.toContain("prompt");
  });

  it("failure logs the original error before any wrap helper runs", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = Object.assign(
      new Error("tools.0.custom: compiled grammar is too large"),
      { name: "BadRequestError", status: 400, requestID: "req_orig" }
    );

    logAngleGenerationFailed({
      correlationId: "corr-fail",
      durationMs: 40,
      error: original,
      operation: "angle_generation",
      requestedModel: "claude-sonnet-4-6",
      repairIteration: 0,
    });

    const dumped = flattenLogCalls(errorSpy);
    expect(dumped).toContain(ANGLE_GENERATION_FAILED);
    expect(dumped).toContain("tools.0.custom: compiled grammar is too large");
    expect(dumped).toContain("BadRequestError");
    expect(dumped).toContain("req_orig");
    expect(dumped).toContain('"statusCode":400');
    expect(dumped).not.toContain(SECRET_SOURCE);
    expect(dumped).not.toContain(SECRET_PROMPT);

    try {
      wrapProposeStudioAnglesError(original);
      throw new Error("expected wrap to throw");
    } catch (wrapped) {
      expect(wrapped).toBeInstanceOf(TRPCError);
      expect((wrapped as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      expect((wrapped as TRPCError).message).toBe(original.message);
    }
  });

  it("generateFromInput boundary logs message, code, and stack without changing the thrown error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not generate carousel angles.",
    });
    logGenerateFromInputCaughtError({
      correlationId: "corr-boundary",
      durationMs: 385,
      error: err,
    });
    const dumped = flattenLogCalls(errorSpy);
    expect(dumped).toContain(GENERATE_FROM_INPUT_FAILED);
    expect(dumped).toContain("Could not generate carousel angles.");
    expect(dumped).toContain("INTERNAL_SERVER_ERROR");
    expect(dumped).toContain("corr-boundary");
    expect(dumped).toContain("stack");
    expect(dumped).not.toContain(SECRET_SOURCE);
    expect(err.message).toBe("Could not generate carousel angles.");
  });

  it("invokeLLM angle_generation logs stay sanitized and skip other operations", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logAngleInvokeLlmEvent("logical_started", {
      correlationId: "corr-llm",
      operation: "copy_generation",
      requestedModel: "claude-sonnet-4-6",
    });
    expect(info).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logAngleInvokeLlmEvent("logical_started", {
      correlationId: "corr-llm",
      operation: "angle_generation",
      requestedModel: "claude-sonnet-4-6",
      actualModel: "claude-sonnet-4-6",
    });
    logAngleInvokeLlmEvent("logical_failed", {
      correlationId: "corr-llm",
      operation: "angle_generation",
      requestedModel: "claude-sonnet-4-6",
      httpStatus: 400,
      providerRequestId: "req_llm",
      errorMessage: "tools.0.custom: compiled grammar is too large",
    });

    const dumped = `${flattenLogCalls(info)}\n${flattenLogCalls(errorSpy)}`;
    expect(dumped).toContain(INVOKE_LLM_LOGICAL_STARTED);
    expect(dumped).toContain(INVOKE_LLM_LOGICAL_FAILED);
    expect(dumped).toContain("req_llm");
    expect(dumped).not.toContain(SECRET_SOURCE);
    expect(dumped).not.toContain(SECRET_PROMPT);
    expect(info.mock.calls[0]?.[1]).not.toHaveProperty("messages");
    expect(info.mock.calls[0]?.[1]).not.toHaveProperty("prompt");
  });
});
