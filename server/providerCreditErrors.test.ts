import { describe, expect, it, vi } from "vitest";

vi.mock("./monitoring/alerts", () => ({ alertOwnerThrottled: vi.fn() }));

import { isOpenAiCreditCode } from "./viralPosts/embeddings";
import { isOpenAiBackupCreditError } from "./_core/claudeClient";
import { isDeepgramCreditError } from "./services/transcribeReel";

describe("recognising a provider out of credit", () => {
  it("OpenAI embeddings", () => {
    expect(isOpenAiCreditCode("credit_balance_exhausted")).toBe(true);
    expect(isOpenAiCreditCode("insufficient_quota")).toBe(true);
    expect(isOpenAiCreditCode("rate_limit_exceeded")).toBe(false);
    expect(isOpenAiCreditCode("")).toBe(false);
  });

  it("OpenAI backup for Claude", () => {
    const body = '{"error":{"message":"You have no credits remaining.","type":"insufficient_quota","code":"credit_balance_exhausted"}}';
    expect(isOpenAiBackupCreditError(new Error(`OpenAI backup 429: ${body}`))).toBe(true);
    expect(isOpenAiBackupCreditError(new Error('OpenAI backup 429: {"error":{"code":"rate_limit_exceeded"}}'))).toBe(false);
    expect(isOpenAiBackupCreditError(new Error("OpenAI backup 500: server error"))).toBe(false);
    expect(isOpenAiBackupCreditError(new Error("Claude credit balance is too low"))).toBe(false);
  });

  it("Deepgram", () => {
    expect(isDeepgramCreditError(402, "Payment Required")).toBe(true);
    expect(isDeepgramCreditError(400, "Insufficient funds in project")).toBe(true);
    expect(isDeepgramCreditError(429, "Too many requests")).toBe(false);
    expect(isDeepgramCreditError(undefined, "timeout")).toBe(false);
  });
});
