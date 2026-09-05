import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMessage = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: createMessage,
    },
  })),
}));

import { invokeLLM } from "./llm";

const HUNG_BUDGET_MS = 25_000;

function fakeMessage(text: string) {
  return {
    id: "msg_test",
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 8 },
  };
}

function abortableHang(_body: unknown, options: { signal?: AbortSignal }) {
  return new Promise((_resolve, reject) => {
    const fail = () => {
      const err = new Error("Request was aborted.");
      err.name = "APIUserAbortError";
      reject(err);
    };
    if (options.signal?.aborted) {
      fail();
      return;
    }
    options.signal?.addEventListener("abort", fail, { once: true });
  });
}

describe("invokeLLM timeoutMs total budget", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    createMessage.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it("returns a normal response without aborting", async () => {
    createMessage.mockResolvedValue(fakeMessage('{"ok":true}'));

    const resultPromise = invokeLLM({
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: HUNG_BUDGET_MS,
    });
    const result = await resultPromise;

    expect(result.choices[0]?.message.content).toBe('{"ok":true}');
    expect(createMessage).toHaveBeenCalledTimes(1);
    const options = createMessage.mock.calls[0]?.[1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.maxRetries).toBe(0);
    expect(options.signal.aborted).toBe(false);
  });

  it("aborts a hung provider at the total deadline and does not start another attempt", async () => {
    createMessage.mockImplementation(abortableHang);

    const resultPromise = invokeLLM({
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: HUNG_BUDGET_MS,
    });
    const expectation = expect(resultPromise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(HUNG_BUDGET_MS);
    await expectation;

    expect(createMessage).toHaveBeenCalledTimes(1);
    const options = createMessage.mock.calls[0]?.[1];
    expect(options.signal.aborted).toBe(true);
    expect(options.maxRetries).toBe(0);
    expect(options.timeout).toBeLessThanOrEqual(HUNG_BUDGET_MS);
  });

  it("accepts a slow provider that finishes inside the budget", async () => {
    createMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(fakeMessage("slow-ok")), 8_000);
        })
    );

    const resultPromise = invokeLLM({
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: HUNG_BUDGET_MS,
    });
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await resultPromise;

    expect(result.choices[0]?.message.content).toBe("slow-ok");
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createMessage.mock.calls[0]?.[1]?.signal.aborted).toBe(false);
  });

  it("does not apply a deadline when timeoutMs is omitted", async () => {
    createMessage.mockResolvedValue(fakeMessage("open-ended"));

    const result = await invokeLLM({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.choices[0]?.message.content).toBe("open-ended");
    expect(createMessage.mock.calls[0]?.[1]).toBeUndefined();
  });
});
