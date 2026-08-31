import { ENV } from "./env";
import { sanitizeAiOutput } from "../utils/sanitizeAiOutput";
import {
  formatIdeaScriptErrorForUser,
  isRetryableLlmError,
  type IdeaScriptErrorContext,
} from "@shared/ideaScriptErrors";
import {
  categorizeGenerationError,
  resolveInvokeTelemetry,
  type GenerationTelemetryContext,
} from "../carousel/generationTelemetry";

function errorContextForOperation(operation?: string): IdeaScriptErrorContext {
  if (operation === "angle_generation") return "carousel";
  return "script";
}

function asUserFacingLlmError(
  error: unknown,
  context: IdeaScriptErrorContext = "script"
): Error {
  const message = formatIdeaScriptErrorForUser(error, context);
  const next = new Error(message);
  const status = (error as { status?: number })?.status;
  if (typeof status === "number") {
    (next as { status?: number }).status = status;
  }
  return next;
}
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_LLM_MODEL = "claude-sonnet-4-6";
const FALLBACK_LLM_MODEL = "claude-haiku-4-5-20251001";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  /** Defaults to 8192 when omitted (existing behavior). */
  maxTokens?: number;
  max_tokens?: number;
  /** Overrides default model (`claude-sonnet-4-6`). */
  model?: string;
  /** When omitted, Anthropic applies its default. */
  temperature?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /** Logical operation label for carousel generation telemetry. */
  operation?: string;
  /** 0 = first attempt, 1+ = repair / validation retry. */
  repairIteration?: number;
  /** Explicit telemetry context. ALS is only a fallback. */
  telemetry?: GenerationTelemetryContext;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicImageBlock = {
  type: "image";
  source:
    | { type: "url"; url: string }
    | {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        data: string;
      };
};
type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock;

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/;

const toAnthropicContentBlock = (part: MessageContent): AnthropicContentBlock => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "image_url") {
    const url = part.image_url.url;
    const dataUrlMatch = DATA_URL_PATTERN.exec(url);
    if (dataUrlMatch) {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: dataUrlMatch[1] as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: dataUrlMatch[2],
        },
      };
    }
    return { type: "image", source: { type: "url", url } };
  }
  // file_url and any other unsupported part types are not yet mapped to a
  // native Anthropic block type. Fall back to a text description rather
  // than silently dropping the part.
  return { type: "text", text: JSON.stringify(part) };
};

const toAnthropicContent = (
  content: MessageContent | MessageContent[]
): string | AnthropicContentBlock[] => {
  const blocks = ensureArray(content).map(toAnthropicContentBlock);
  if (blocks.length === 1 && blocks[0].type === "text") {
    return blocks[0].text;
  }
  return blocks;
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const assertApiKey = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    temperature,
    maxTokens: maxTokensParam,
    max_tokens: max_tokensParam,
  } = params;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  const systemPrompt = systemMessages
    .map(m => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join("\n");

  const normalizedMessages = nonSystemMessages.map(m => ({
    role: m.role as "user" | "assistant",
    content: toAnthropicContent(m.content),
  }));

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  const isJson = normalizedResponseFormat?.type === "json_object" || normalizedResponseFormat?.type === "json_schema";

  const finalSystemPrompt = isJson
    ? `${systemPrompt}\n\nRespond with valid JSON only. No markdown, no explanation.`
    : systemPrompt;

  const forcedSchemaTool =
    normalizedResponseFormat?.type === "json_schema"
      ? {
          name: normalizedResponseFormat.json_schema.name,
          description: `Return the response in the ${normalizedResponseFormat.json_schema.name} shape.`,
          input_schema: normalizedResponseFormat.json_schema.schema as any,
          strict: normalizedResponseFormat.json_schema.strict ?? false,
        }
      : null;
  const forcedToolChoice = forcedSchemaTool
    ? ({ type: "tool" as const, name: forcedSchemaTool.name })
    : undefined;
  const maxTokensResolved = maxTokensParam ?? max_tokensParam ?? 8192;
  const modelsToTry = model ? [model] : [DEFAULT_LLM_MODEL, FALLBACK_LLM_MODEL];
  const retryDelaysMs = [1500, 3000, 6000];
  const telemetry = resolveInvokeTelemetry(params.telemetry);
  const operation = params.operation ?? "llm_invoke";
  const repairIteration = params.repairIteration ?? 0;
  const requestedModel = model ?? DEFAULT_LLM_MODEL;
  const logicalStarted = performance.now();
  telemetry?.collector.beginLogicalLlmCall();

  let response: Awaited<ReturnType<Anthropic["messages"]["create"]>> | null = null;
  let lastError: unknown;

  const recordPhysical = (row: {
    model: string;
    attemptNumber: number;
    durationMs: number;
    success: boolean;
    error?: unknown;
    fallbackOccurred: boolean;
    inputTokens?: number;
    outputTokens?: number;
  }) => {
    try {
      telemetry?.collector.recordPhysicalLlmAttempt({
        model: row.model,
        attemptNumber: row.attemptNumber,
        durationMs: Math.max(0, Math.round(row.durationMs)),
        success: row.success,
        errorCategory: row.success
          ? null
          : categorizeGenerationError(row.error),
        fallbackOccurred: row.fallbackOccurred,
        inputTokens: row.inputTokens ?? null,
        outputTokens: row.outputTokens ?? null,
        totalTokens:
          row.inputTokens != null && row.outputTokens != null
            ? row.inputTokens + row.outputTokens
            : null,
      });
    } catch (err) {
      console.error("[carouselTelemetry] physical LLM record failed", err);
    }
  };

  const recordLogical = (row: {
    success: boolean;
    actualModel: string | null;
    inputTokens?: number;
    outputTokens?: number;
  }) => {
    try {
      telemetry?.collector.recordLogicalLlmCall({
        operation,
        requestedModel,
        actualModel: row.actualModel,
        durationMs: Math.max(0, Math.round(performance.now() - logicalStarted)),
        success: row.success,
        inputTokens: row.inputTokens ?? null,
        outputTokens: row.outputTokens ?? null,
        totalTokens:
          row.inputTokens != null && row.outputTokens != null
            ? row.inputTokens + row.outputTokens
            : null,
        repairIteration,
      });
    } catch (err) {
      console.error("[carouselTelemetry] logical LLM record failed", err);
    }
  };

  modelLoop: for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex++) {
    const currentModel = modelsToTry[modelIndex]!;
    if (modelIndex > 0) {
      console.warn(`[invokeLLM] retrying with fallback model ${currentModel}`);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const attemptStarted = performance.now();
      try {
        response = await client.messages.create({
          model: currentModel,
          max_tokens: maxTokensResolved,
          ...(typeof temperature === "number" ? { temperature } : {}),
          ...(finalSystemPrompt ? { system: finalSystemPrompt } : {}),
          messages: normalizedMessages,
          ...(forcedSchemaTool
            ? { tools: [forcedSchemaTool], tool_choice: forcedToolChoice }
            : {}),
        });
        recordPhysical({
          model: response.model || currentModel,
          attemptNumber: attempt + 1,
          durationMs: performance.now() - attemptStarted,
          success: true,
          fallbackOccurred: modelIndex > 0,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        });
        break modelLoop;
      } catch (err) {
        lastError = err;
        recordPhysical({
          model: currentModel,
          attemptNumber: attempt + 1,
          durationMs: performance.now() - attemptStarted,
          success: false,
          error: err,
          fallbackOccurred: modelIndex > 0,
        });
        const status = (err as { status?: number })?.status;
        console.error(
          `[invokeLLM] attempt ${attempt + 1}/3 failed`,
          { status, model: currentModel, message: err instanceof Error ? err.message : String(err) }
        );

        if (!isRetryableLlmError(err)) {
          recordLogical({ success: false, actualModel: null });
          throw asUserFacingLlmError(err, errorContextForOperation(operation));
        }

        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt] ?? 6000));
          continue;
        }
      }
    }
  }

  if (!response) {
    recordLogical({ success: false, actualModel: null });
    throw asUserFacingLlmError(
      lastError instanceof Error ? lastError : new Error("LLM request failed"),
      errorContextForOperation(operation)
    );
  }

  const toolUseContent = forcedSchemaTool
    ? response.content.find(
        b => b.type === "tool_use" && b.name === forcedSchemaTool.name
      )
    : undefined;
  const textContent = response.content.find(b => b.type === "text");
  const rawTextValue =
    toolUseContent && toolUseContent.type === "tool_use"
      ? JSON.stringify(toolUseContent.input)
      : textContent && textContent.type === "text"
      ? textContent.text
      : "";
  const textValue = sanitizeAiOutput(rawTextValue);

  recordLogical({
    success: true,
    actualModel: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  return {
    id: response.id,
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textValue,
        },
        finish_reason: response.stop_reason,
      },
    ],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}
