import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
vi.mock("../monitoring/alerts", () => ({ alertOwnerThrottled: vi.fn() }));

import {
  cleanRequestText,
  claudeOutOfCredit,
  claudeUnavailable,
  createClaudeClient,
  fromOpenAiResponse,
  resetClaudeCreditStateForTests,
  shouldUseBackup,
  toOpenAiRequest,
} from "./claudeClient";

const creditError = Object.assign(
  new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'),
  { status: 400 }
);
const openAiOk = (text: string) =>
  new Response(JSON.stringify({ id: "x", choices: [{ finish_reason: "stop", message: { content: text } }], usage: { prompt_tokens: 10, completion_tokens: 3 } }), {
    status: 200,
  });

describe("claudeClient backup", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    create.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENAI_API_KEY = "test-openai";
    delete process.env.OPENAI_FALLBACK;
    resetClaudeCreditStateForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("uses Claude when it answers", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "claude" }] });
    const out = await createClaudeClient().messages.create({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }] });
    expect((out.content[0] as { text: string }).text).toBe("claude");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers with OpenAI when Claude is out of credit, then skips Claude until the pause ends", async () => {
    create.mockRejectedValue(creditError);
    fetchMock.mockImplementation(async () => openAiOk("backup"));
    const client = createClaudeClient();
    const params = { model: "m", max_tokens: 10, system: "sys", messages: [{ role: "user" as const, content: "hi" }] };
    const first = await client.messages.create(params);
    expect((first.content[0] as { text: string }).text).toBe("backup");
    expect(claudeOutOfCredit()).toBe(true);
    expect(claudeUnavailable()).toBe(false); // backup is there
    await client.messages.create(params);
    expect(create).toHaveBeenCalledTimes(1); // second call went straight to the backup
  });

  it("throws the Claude error when there is no backup key", async () => {
    delete process.env.OPENAI_API_KEY;
    create.mockRejectedValue(creditError);
    await expect(createClaudeClient().messages.create({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }] })).rejects.toBe(creditError);
    expect(claudeUnavailable()).toBe(true);
  });

  it("does not use the backup for request mistakes", async () => {
    create.mockRejectedValue(Object.assign(new Error("400 bad request"), { status: 400 }));
    await expect(createClaudeClient().messages.create({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }] })).rejects.toThrow("bad request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decides which errors go to the backup", () => {
    expect(shouldUseBackup(creditError)).toBe(true);
    expect(shouldUseBackup(Object.assign(new Error("overloaded"), { status: 529 }))).toBe(true);
    expect(shouldUseBackup(Object.assign(new Error("unauthorized"), { status: 401 }))).toBe(true);
    expect(shouldUseBackup(Object.assign(new Error("rate"), { status: 429 }))).toBe(false);
  });

  it("translates images and a forced tool both ways", () => {
    const body = toOpenAiRequest(
      {
        max_tokens: 50,
        temperature: 0,
        system: [{ type: "text", text: "be brief" }],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "what is this" },
              { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } },
            ],
          },
        ],
        tools: [{ name: "answer", description: "d", input_schema: { type: "object" } }],
        tool_choice: { type: "tool", name: "answer" },
      },
      "gpt-4.1-mini"
    );
    expect(body.max_completion_tokens).toBe(50);
    expect((body.messages as Array<{ role: string }>)[0]!.role).toBe("system");
    expect(JSON.stringify(body.messages)).toContain("data:image/png;base64,AAA");
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "answer" } });

    const msg = fromOpenAiResponse({ choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "answer", arguments: '{"a":1}' } }] } }] });
    expect(msg.content[0]).toMatchObject({ type: "tool_use", name: "answer", input: { a: 1 } });
    expect(msg.stop_reason).toBe("tool_use");
  });

  it("removes half emoji from request text but keeps whole emoji and image bytes", async () => {
    const half = "great food \uD83D"; // emoji cut in half
    const cleaned = cleanRequestText({
      messages: [{ role: "user", content: [{ type: "text", text: `${half} 🍕` }, { type: "image", source: { type: "base64", data: "AB\uD83DC" } }] }],
    });
    expect(cleaned.messages[0]!.content[0]!.text).toBe("great food  🍕");
    expect((cleaned.messages[0]!.content[1] as { source: { data: string } }).source.data).toBe("AB\uD83DC");

    create.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await createClaudeClient().messages.create({ model: "m", max_tokens: 10, system: half, messages: [{ role: "user", content: half }] });
    const sent = create.mock.calls[0]![0] as { system: string; messages: Array<{ content: string }> };
    expect(sent.system).toBe("great food ");
    expect(sent.messages[0]!.content).toBe("great food ");
  });
});
