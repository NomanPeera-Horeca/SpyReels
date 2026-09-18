import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { searchReelsByHandle } from "./instagram";
import { transcribeReel } from "./services/transcribeReel";
import {
  fetchAudienceSignalsFromWeb,
  fetchTopicResearchFromWeb,
} from "./audienceResearch/fetchSignals";
import { invokeLLM } from "./_core/llm";

const BENCHMARK_PATH = "/api/internal/remake-benchmark";
const BENCHMARK_AUDIENCE = "spyreels-remake-benchmark";
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks")
);

const MAX_CALLS_PER_RUN = 260;
const runCallCounts = new Map<string, number>();

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(80_000),
});

const benchmarkRequestSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("search_reels"),
    handle: z.string().trim().min(1).max(128),
    limit: z.number().int().min(1).max(8).default(5),
  }),
  z.object({
    op: z.literal("transcribe"),
    videoUrl: z.string().url().max(8_000),
    shortcode: z.string().trim().min(3).max(128),
  }),
  z.object({
    op: z.literal("topic_research"),
    idea: z.string().trim().min(3).max(800),
    nicheLabel: z.string().trim().min(1).max(160),
  }),
  z.object({
    op: z.literal("audience_research"),
    nicheSlug: z.string().trim().min(1).max(128),
    nicheLabel: z.string().trim().min(1).max(160),
    targetAudience: z.string().trim().min(1).max(500),
  }),
  z.object({
    op: z.literal("llm"),
    messages: z.array(messageSchema).min(1).max(16),
    model: z.string().trim().max(128).optional(),
    maxTokens: z.number().int().min(1).max(4096).optional(),
    temperature: z.number().min(0).max(1).optional(),
    responseFormat: z.unknown().optional(),
  }),
]);

export type RemakeBenchmarkRequest = z.infer<typeof benchmarkRequestSchema>;

export function validateRemakeBenchmarkClaims(payload: JWTPayload): {
  runId: string;
} {
  const repository = String(payload.repository ?? "");
  const workflowRef = String(payload.job_workflow_ref ?? "");
  const eventName = String(payload.event_name ?? "");
  const ref = String(payload.ref ?? "");
  const runId = String(payload.run_id ?? "");

  if (repository !== "NomanPeera-Horeca/SpyReels") {
    throw new Error("Unexpected GitHub repository.");
  }

  if (
    !workflowRef.includes(
      ".github/workflows/remake-hardening-live-benchmark.yml@"
    )
  ) {
    throw new Error("Unexpected GitHub workflow.");
  }

  if (!["pull_request", "workflow_dispatch"].includes(eventName)) {
    throw new Error("Unsupported GitHub Actions event.");
  }

  const allowedRef =
    ref === "refs/pull/71/merge" ||
    ref === "refs/heads/feature/remake-hardening-v1";
  if (!allowedRef) {
    throw new Error("Unexpected benchmark ref.");
  }

  if (!runId) {
    throw new Error("Missing GitHub Actions run id.");
  }

  return { runId };
}

async function authenticateBenchmarkRequest(req: Request): Promise<{
  runId: string;
}> {
  const auth = req.headers.authorization?.trim() ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const verified = await jwtVerify(token, GITHUB_JWKS, {
    issuer: GITHUB_OIDC_ISSUER,
    audience: BENCHMARK_AUDIENCE,
  });

  return validateRemakeBenchmarkClaims(verified.payload);
}

function consumeRunBudget(runId: string): void {
  const next = (runCallCounts.get(runId) ?? 0) + 1;
  if (next > MAX_CALLS_PER_RUN) {
    throw new Error("Benchmark call budget exceeded.");
  }
  runCallCounts.set(runId, next);

  if (runCallCounts.size > 200) {
    const oldest = runCallCounts.keys().next().value as string | undefined;
    if (oldest) runCallCounts.delete(oldest);
  }
}

function allowedModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  if (
    model === "claude-sonnet-4-6" ||
    model === "claude-haiku-4-5-20251001"
  ) {
    return model;
  }
  throw new Error("Model not allowed for benchmark proxy.");
}

export async function executeRemakeBenchmarkOperation(
  input: RemakeBenchmarkRequest
): Promise<unknown> {
  switch (input.op) {
    case "search_reels": {
      const result = await searchReelsByHandle(input.handle, input.limit);
      return {
        reels: result.reels.map((reel) => ({
          shortcode: reel.shortcode,
          reelUrl: reel.reelUrl,
          videoUrl: reel.videoUrl,
          caption: reel.caption ?? "",
          viewCount: reel.viewCount ?? 0,
          likeCount: reel.likeCount ?? 0,
          commentCount: reel.commentCount ?? 0,
          duration: reel.duration ?? 0,
          postedAt:
            reel.postedAt instanceof Date
              ? reel.postedAt.toISOString()
              : new Date(reel.postedAt).toISOString(),
        })),
      };
    }

    case "transcribe": {
      return transcribeReel({
        videoUrl: input.videoUrl,
        shortcode: input.shortcode,
      });
    }

    case "topic_research":
      return fetchTopicResearchFromWeb({
        idea: input.idea,
        nicheLabel: input.nicheLabel,
      });

    case "audience_research":
      return fetchAudienceSignalsFromWeb({
        nicheSlug: input.nicheSlug,
        nicheLabel: input.nicheLabel,
        targetAudience: input.targetAudience,
      });

    case "llm": {
      const response = await invokeLLM({
        messages: input.messages,
        model: allowedModel(input.model),
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        response_format:
          input.responseFormat &&
          typeof input.responseFormat === "object"
            ? (input.responseFormat as any)
            : undefined,
        operation: "remake_live_benchmark",
      });
      return response;
    }
  }
}

export function registerRemakeBenchmarkProxy(app: Express): void {
  app.post(BENCHMARK_PATH, async (req: Request, res: Response) => {
    try {
      const auth = await authenticateBenchmarkRequest(req);
      consumeRunBudget(auth.runId);

      const parsed = benchmarkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          ok: false,
          error: "invalid_request",
          message: parsed.error.issues
            .map((issue) => {
              const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
              return `${path}${issue.message}`;
            })
            .join("; "),
        });
        return;
      }

      const data = await executeRemakeBenchmarkOperation(parsed.data);
      res.json({ ok: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const authFailure =
        /token|github|repository|workflow|event|ref|run id/i.test(message);

      if (!authFailure) {
        console.error("[RemakeBenchmarkProxy] request failed", error);
      }

      res.status(authFailure ? 401 : 500).json({
        ok: false,
        error: authFailure ? "unauthorized" : "benchmark_proxy_error",
        message: authFailure
          ? "Benchmark authentication failed."
          : "Benchmark proxy operation failed.",
      });
    }
  });
}
