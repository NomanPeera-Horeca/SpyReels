import { randomUUID } from "node:crypto";
import {
  AI_GATEWAY_SOURCES,
  type AiGatewayActor,
  type AiGatewayContext,
  type AiGatewaySource,
} from "./types";

const knownSources = new Set<string>(AI_GATEWAY_SOURCES);

/**
 * Convert transport/client hints into a stable attribution value.
 * Unknown clients deliberately stay `unknown` instead of being guessed.
 */
export function normalizeAiGatewaySource(value: unknown): AiGatewaySource {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  return knownSources.has(normalized)
    ? (normalized as AiGatewaySource)
    : "unknown";
}

export function createAiGatewayContext(input?: {
  requestId?: string | null;
  source?: string | null;
  clientName?: string | null;
  actor?: AiGatewayActor | null;
}): AiGatewayContext {
  const requestId = input?.requestId?.trim() || randomUUID();
  const clientName = input?.clientName?.trim() || null;

  return {
    requestId,
    source: normalizeAiGatewaySource(input?.source),
    clientName,
    actor: input?.actor ?? null,
    startedAt: new Date(),
  };
}
