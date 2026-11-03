/**
 * One way to create a Claude client, with a backup: if Claude cannot answer
 * because the account is out of credit, the key is rejected, or Anthropic is
 * down, the same request is sent to OpenAI and the answer comes back in
 * Claude's format, so callers do not change.
 *
 * - Out of credit: Claude is skipped for CLAUDE_CREDIT_PAUSE_MS (15 minutes),
 *   then tried again, so work goes back to Claude by itself once credit is
 *   topped up. The owner gets one Telegram alert.
 * - The backup handles text, images and a single forced tool (invokeLLM's
 *   structured output). Anything else (tool results, documents, several
 *   tools) is not translated, and the original Claude error is thrown.
 * - No OPENAI_API_KEY, or OPENAI_FALLBACK=false: the Claude error is thrown,
 *   as before.
 *
 * OPENAI_FALLBACK_MODEL picks the backup model (default gpt-4.1-mini).
 */
import Anthropic from "@anthropic-ai/sdk";
import { alertOwnerThrottled } from "../monitoring/alerts";

export const CLAUDE_CREDIT_PAUSE_MS = 15 * 60 * 1000;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

let lastOutOfCreditAt: number | null = null;

export function openAiFallbackModel(): string {
  return process.env.OPENAI_FALLBACK_MODEL?.trim() || "gpt-4.1-mini";
}

export function openAiFallbackAvailable(): boolean {
  return process.env.OPENAI_FALLBACK !== "false" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** True while Claude is known to be out of credit (it is retried after the pause). */
export function claudeOutOfCredit(now = Date.now()): boolean {
  return lastOutOfCreditAt != null && now - lastOutOfCreditAt < CLAUDE_CREDIT_PAUSE_MS;
}

/** True when neither Claude nor the backup can answer right now: background AI work should wait. */
export function claudeUnavailable(now = Date.now()): boolean {
  return claudeOutOfCredit(now) && !openAiFallbackAvailable();
}

export function resetClaudeCreditStateForTests(): void {
  lastOutOfCreditAt = null;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function errorStatus(err: unknown): number | undefined {
  const s = (err as { status?: unknown })?.status;
  return typeof s === "number" ? s : undefined;
}

/** Out of credit or billing problem. Pure; exported for tests. */
export function isCreditError(err: unknown): boolean {
  return /credit balance is too low|billing/i.test(errorText(err));
}

/** Errors where the backup should answer: credit, rejected key, Anthropic down. Pure; exported for tests. */
export function shouldUseBackup(err: unknown): boolean {
  if (isCreditError(err)) return true;
  const status = errorStatus(err);
  if (status === 401 || status === 403) return true;
  if (status != null && (status === 529 || status >= 500)) return true;
  return false;
}

function noteCreditError(): void {
  const first = !claudeOutOfCredit();
  lastOutOfCreditAt = Date.now();
  if (first) {
    alertOwnerThrottled({
      kind: "anthropic_out_of_credit",
      message: openAiFallbackAvailable()
        ? "Claude (Anthropic) is out of credit. SpyReels switched to the OpenAI backup and goes back to Claude by itself once credit is topped up."
        : "Claude (Anthropic) is out of credit and there is no OpenAI backup key. AI features fail and background AI work is paused until credit is topped up.",
    });
  }
}

type AnyBlock = Record<string, unknown> & { type?: string };
type OpenAiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

class NotTranslatable extends Error {}

function toOpenAiParts(content: unknown): string | OpenAiPart[] {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) throw new NotTranslatable("content");
  return (content as AnyBlock[]).map(block => {
    if (block.type === "text") return { type: "text", text: String(block.text ?? "") };
    if (block.type === "image") {
      const src = block.source as { type?: string; media_type?: string; data?: string; url?: string } | undefined;
      if (src?.type === "base64" && src.data) {
        return { type: "image_url", image_url: { url: `data:${src.media_type ?? "image/jpeg"};base64,${src.data}` } };
      }
      if (src?.type === "url" && src.url) return { type: "image_url", image_url: { url: src.url } };
    }
    throw new NotTranslatable(String(block.type));
  });
}

function systemText(system: unknown): string | null {
  if (system == null) return null;
  if (typeof system === "string") return system;
  if (Array.isArray(system)) return (system as AnyBlock[]).map(b => String(b.text ?? "")).join("\n");
  throw new NotTranslatable("system");
}

/** Claude request -> OpenAI chat request. Throws NotTranslatable when it cannot. Pure; exported for tests. */
export function toOpenAiRequest(params: Record<string, unknown>, model = openAiFallbackModel()): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];
  const sys = systemText(params.system);
  if (sys) messages.push({ role: "system", content: sys });
  for (const m of (params.messages as Array<{ role: string; content: unknown }>) ?? []) {
    if (m.role !== "user" && m.role !== "assistant") throw new NotTranslatable(m.role);
    const parts = toOpenAiParts(m.content);
    // OpenAI assistant messages take text only.
    messages.push({
      role: m.role,
      content: m.role === "assistant" && Array.isArray(parts) ? parts.map(p => (p.type === "text" ? p.text : "")).join("") : parts,
    });
  }
  const body: Record<string, unknown> = { model, messages };
  if (typeof params.max_tokens === "number") body.max_completion_tokens = params.max_tokens;
  if (typeof params.temperature === "number") body.temperature = params.temperature;

  const tools = params.tools as Array<{ name: string; description?: string; input_schema?: unknown }> | undefined;
  if (tools && tools.length > 0) {
    const choice = params.tool_choice as { type?: string; name?: string } | undefined;
    if (tools.length !== 1 || choice?.type !== "tool" || choice.name !== tools[0]!.name) throw new NotTranslatable("tools");
    const tool = tools[0]!;
    body.tools = [{ type: "function", function: { name: tool.name, description: tool.description ?? "", parameters: tool.input_schema ?? { type: "object" } } }];
    body.tool_choice = { type: "function", function: { name: tool.name } };
  }
  return body;
}

type OpenAiResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** OpenAI chat response -> Claude message. Pure; exported for tests. */
export function fromOpenAiResponse(res: OpenAiResponse, model = openAiFallbackModel()): Anthropic.Message {
  const choice = res.choices?.[0];
  const content: Array<Record<string, unknown>> = [];
  const call = choice?.message?.tool_calls?.[0];
  if (call?.function?.name) {
    content.push({ type: "tool_use", id: call.id ?? "toolu_openai", name: call.function.name, input: JSON.parse(call.function.arguments || "{}") });
  } else {
    content.push({ type: "text", text: choice?.message?.content ?? "", citations: null });
  }
  return {
    id: res.id ?? "msg_openai",
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: call ? "tool_use" : choice?.finish_reason === "length" ? "max_tokens" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: res.usage?.prompt_tokens ?? 0, output_tokens: res.usage?.completion_tokens ?? 0 },
  } as unknown as Anthropic.Message;
}

async function askOpenAi(params: Record<string, unknown>, options: unknown): Promise<Anthropic.Message> {
  const model = openAiFallbackModel();
  const body = toOpenAiRequest(params, model);
  const signal = (options as { signal?: AbortSignal } | undefined)?.signal;
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`OpenAI backup ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return fromOpenAiResponse((await res.json()) as OpenAiResponse, model);
}

/**
 * A Claude client whose messages.create falls back to OpenAI. Use it
 * everywhere instead of `new Anthropic(...)`.
 */
export function createClaudeClient(opts: ConstructorParameters<typeof Anthropic>[0] = {}): Anthropic {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, ...opts });
  const original = client.messages.create.bind(client.messages) as (p: unknown, o?: unknown) => Promise<unknown>;
  const wrapped = async (params: Record<string, unknown>, options?: unknown): Promise<unknown> => {
    if (params.stream) return original(params, options);
    const backupReady = openAiFallbackAvailable();
    // While Claude is out of credit, go straight to the backup (no wasted call).
    if (backupReady && claudeOutOfCredit()) {
      try {
        return await askOpenAi(params, options);
      } catch (err) {
        if (!(err instanceof NotTranslatable)) throw err;
        // not translatable: try Claude anyway below
      }
    }
    try {
      const out = await original(params, options);
      lastOutOfCreditAt = null; // Claude answered: credit is back
      return out;
    } catch (err) {
      if (isCreditError(err)) noteCreditError();
      if (!backupReady || !shouldUseBackup(err)) throw err;
      try {
        const out = await askOpenAi(params, options);
        console.warn("[claude] answered_by_openai_backup", { reason: errorStatus(err) ?? "error", model: openAiFallbackModel() });
        return out;
      } catch (backupErr) {
        if (!(backupErr instanceof NotTranslatable)) {
          console.warn("[claude] openai_backup_failed", { error: errorText(backupErr).slice(0, 200) });
        }
        throw err;
      }
    }
  };
  // Proxies, not mutation: the SDK (or a test mock) may share its messages object.
  const messages = new Proxy(client.messages, {
    get: (target, prop, receiver) => (prop === "create" ? wrapped : Reflect.get(target, prop, receiver)),
  });
  return new Proxy(client, {
    get: (target, prop, receiver) => (prop === "messages" ? messages : Reflect.get(target, prop, receiver)),
  });
}
