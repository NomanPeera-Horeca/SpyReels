/**
 * Viral Posts thumbnail mirroring with hard timeouts and source fallback.
 * Never blocks the daily-feed critical path indefinitely.
 */
import { reelThumbnailR2Key } from "../reelThumbnailR2";
import { r2ObjectPublicUrl, storageHead, storagePut } from "../storage";

export type ViralMediaStatus =
  | "pending"
  | "mirrored"
  | "source_fallback"
  | "failed";

export type MirrorThumbnailInput = {
  sourceId: string;
  sourceThumbnailUrl: string | null | undefined;
};

export type MirrorThumbnailResult = {
  sourceId: string;
  thumbnailUrl: string | null;
  mediaStatus: ViralMediaStatus;
  error?: string;
};

export type MirrorDeps = {
  fetchBuffer: (url: string, timeoutMs: number) => Promise<{
    statusCode: number;
    body: Buffer;
    contentType: string | null;
  }>;
  headExists: (key: string) => Promise<boolean>;
  putObject: (
    key: string,
    body: Buffer,
    contentType: string
  ) => Promise<{ url: string }>;
  publicUrl: (key: string) => string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export const MIRROR_DEFAULTS = {
  fetchTimeoutMs: 8_000,
  uploadTimeoutMs: 8_000,
  headTimeoutMs: 5_000,
  overallTimeoutMs: 12_000,
  maxRetries: 1,
  maxConcurrency: 3,
  maxBytes: 2_500_000,
  allowedContentTypes: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ] as const,
};

function withTimeout<T>(
  label: string,
  ms: number,
  fn: () => Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`TIMEOUT ${ms}ms: ${label}`));
    }, ms);
    fn()
      .then((value) => resolve(value))
      .catch((err) => reject(err))
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  });
}

function normalizeContentType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.split(";")[0]?.trim().toLowerCase() || null;
}

function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return (MIRROR_DEFAULTS.allowedContentTypes as readonly string[]).includes(
    contentType
  );
}

export function resolveThumbnailFallback(args: {
  mirroredUrl?: string | null;
  sourceThumbnailUrl?: string | null;
  mediaStatus?: ViralMediaStatus | null;
}): { thumbnailUrl: string | null; mediaStatus: ViralMediaStatus } {
  const mirrored = (args.mirroredUrl ?? "").trim();
  if (mirrored) {
    return { thumbnailUrl: mirrored, mediaStatus: "mirrored" };
  }
  const source = (args.sourceThumbnailUrl ?? "").trim();
  if (source) {
    return { thumbnailUrl: source, mediaStatus: "source_fallback" };
  }
  return { thumbnailUrl: null, mediaStatus: "failed" };
}

export async function createDefaultMirrorDeps(): Promise<MirrorDeps> {
  return {
    fetchBuffer: async (url, timeoutMs) => {
      const { gotScraping: gs } = await import("got-scraping");
      const res = await gs({
        url,
        responseType: "buffer",
        timeout: { request: timeoutMs },
        retry: { limit: 0 },
        throwHttpErrors: false,
      });
      const raw = res.rawBody;
      const body = Buffer.isBuffer(raw) ? raw : Buffer.from(raw ?? []);
      const contentType =
        normalizeContentType(
          typeof res.headers["content-type"] === "string"
            ? res.headers["content-type"]
            : null
        ) || null;
      return {
        statusCode: res.statusCode ?? 0,
        body,
        contentType,
      };
    },
    headExists: (key) => storageHead(key),
    putObject: async (key, body, contentType) => {
      const { url } = await storagePut(key, body, contentType);
      return { url };
    },
    publicUrl: (key) => r2ObjectPublicUrl(key),
  };
}

/**
 * Mirror one thumbnail with timeouts, retries, size/content-type checks.
 * Always resolves (never hangs). On failure returns source fallback or null.
 */
export async function mirrorOneThumbnail(
  input: MirrorThumbnailInput,
  deps: MirrorDeps,
  opts?: Partial<typeof MIRROR_DEFAULTS>
): Promise<MirrorThumbnailResult> {
  const cfg = { ...MIRROR_DEFAULTS, ...opts };
  const sourceId = input.sourceId;
  const source = (input.sourceThumbnailUrl ?? "").trim();

  if (!source) {
    return { sourceId, thumbnailUrl: null, mediaStatus: "failed" };
  }

  const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(
    /\/+$/,
    ""
  );
  if (publicBase && source.startsWith(publicBase)) {
    return { sourceId, thumbnailUrl: source, mediaStatus: "mirrored" };
  }

  const safe = sourceId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) {
    return {
      sourceId,
      thumbnailUrl: source,
      mediaStatus: "source_fallback",
      error: "invalid_source_id",
    };
  }

  const key = reelThumbnailR2Key(safe);
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const attempt = async (): Promise<MirrorThumbnailResult> => {
    const exists = await withTimeout(`head:${sourceId}`, cfg.headTimeoutMs, () =>
      deps.headExists(key)
    );
    if (exists) {
      return {
        sourceId,
        thumbnailUrl: deps.publicUrl(key),
        mediaStatus: "mirrored",
      };
    }

    const fetched = await withTimeout(
      `fetch:${sourceId}`,
      cfg.fetchTimeoutMs,
      () => deps.fetchBuffer(source, cfg.fetchTimeoutMs)
    );

    if (fetched.statusCode === 403) {
      return {
        sourceId,
        thumbnailUrl: source,
        mediaStatus: "source_fallback",
        error: "provider_403",
      };
    }
    if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
      return {
        sourceId,
        thumbnailUrl: source,
        mediaStatus: "source_fallback",
        error: `provider_http_${fetched.statusCode}`,
      };
    }
    if (!isAllowedContentType(fetched.contentType)) {
      const sniffed = sniffImageContentType(fetched.body);
      const effective = fetched.contentType ?? sniffed;
      if (!isAllowedContentType(effective)) {
        return {
          sourceId,
          thumbnailUrl: source,
          mediaStatus: "source_fallback",
          error: `invalid_content_type:${fetched.contentType ?? "none"}`,
        };
      }
      fetched.contentType = effective;
    }
    if (fetched.body.byteLength > cfg.maxBytes) {
      return {
        sourceId,
        thumbnailUrl: source,
        mediaStatus: "source_fallback",
        error: `oversized:${fetched.body.byteLength}`,
      };
    }

    try {
      const put = await withTimeout(
        `upload:${sourceId}`,
        cfg.uploadTimeoutMs,
        () =>
          deps.putObject(
            key,
            fetched.body,
            fetched.contentType || "image/jpeg"
          )
      );
      return {
        sourceId,
        thumbnailUrl: put.url,
        mediaStatus: "mirrored",
      };
    } catch (err) {
      return {
        sourceId,
        thumbnailUrl: source,
        mediaStatus: "source_fallback",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  try {
    return await withTimeout(
      `overall:${sourceId}`,
      cfg.overallTimeoutMs,
      async () => {
        let last: MirrorThumbnailResult | null = null;
        for (let i = 0; i <= cfg.maxRetries; i++) {
          try {
            last = await attempt();
            if (last.mediaStatus === "mirrored") return last;
            if (i < cfg.maxRetries) await sleep(150 * (i + 1));
          } catch (err) {
            last = {
              sourceId,
              thumbnailUrl: source,
              mediaStatus: "source_fallback",
              error: err instanceof Error ? err.message : String(err),
            };
            if (i < cfg.maxRetries) await sleep(150 * (i + 1));
          }
        }
        return (
          last ?? {
            sourceId,
            thumbnailUrl: source,
            mediaStatus: "source_fallback",
            error: "exhausted_retries",
          }
        );
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[viralPosts.media] mirror_failed", {
      sourceId,
      error: message,
    });
    return {
      sourceId,
      thumbnailUrl: source,
      mediaStatus: "source_fallback",
      error: message,
    };
  }
}

function sniffImageContentType(body: Buffer): string | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    body.length >= 12 &&
    body.toString("ascii", 0, 4) === "RIFF" &&
    body.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (body.length >= 6 && body.toString("ascii", 0, 3) === "GIF") {
    return "image/gif";
  }
  return null;
}

/**
 * Mirror many thumbnails with concurrency + overall budget.
 * Always settles; never waits indefinitely.
 */
export async function mirrorThumbnailsBounded(
  inputs: MirrorThumbnailInput[],
  deps: MirrorDeps,
  opts?: Partial<typeof MIRROR_DEFAULTS> & { overallBudgetMs?: number }
): Promise<MirrorThumbnailResult[]> {
  const cfg = { ...MIRROR_DEFAULTS, ...opts };
  const budgetMs = opts?.overallBudgetMs ?? 15_000;
  const started = deps.now?.() ?? Date.now();
  const results: MirrorThumbnailResult[] = new Array(inputs.length);
  let next = 0;

  const workers = Array.from(
    { length: Math.min(cfg.maxConcurrency, Math.max(inputs.length, 1)) },
    async () => {
      while (next < inputs.length) {
        const i = next++;
        const input = inputs[i]!;
        const elapsed = (deps.now?.() ?? Date.now()) - started;
        if (elapsed >= budgetMs) {
          const source = (input.sourceThumbnailUrl ?? "").trim() || null;
          results[i] = {
            sourceId: input.sourceId,
            thumbnailUrl: source,
            mediaStatus: source ? "source_fallback" : "failed",
            error: "overall_budget_exceeded",
          };
          continue;
        }
        const remaining = Math.max(1_000, budgetMs - elapsed);
        results[i] = await mirrorOneThumbnail(input, deps, {
          ...cfg,
          overallTimeoutMs: Math.min(cfg.overallTimeoutMs, remaining),
        });
      }
    }
  );

  await Promise.all(workers);
  return results;
}

/**
 * Fire-and-forget background mirror. Must not reject to the caller.
 */
export function scheduleThumbnailMirroring(
  inputs: MirrorThumbnailInput[],
  onDone: (results: MirrorThumbnailResult[]) => Promise<void> | void
): void {
  void (async () => {
    try {
      const deps = await createDefaultMirrorDeps();
      const results = await mirrorThumbnailsBounded(inputs, deps, {
        overallBudgetMs: 20_000,
      });
      await onDone(results);
      console.info("[viralPosts.media] background_mirror_done", {
        count: results.length,
        mirrored: results.filter((r) => r.mediaStatus === "mirrored").length,
        fallback: results.filter((r) => r.mediaStatus === "source_fallback")
          .length,
        failed: results.filter((r) => r.mediaStatus === "failed").length,
      });
    } catch (err) {
      console.error("[viralPosts.media] background_mirror_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
