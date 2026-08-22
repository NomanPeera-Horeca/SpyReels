import { describe, expect, it } from "vitest";
import {
  mirrorOneThumbnail,
  mirrorThumbnailsBounded,
  resolveThumbnailFallback,
  type MirrorDeps,
} from "../mediaMirror";

function jpegBuffer(size = 128): Buffer {
  const buf = Buffer.alloc(size, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

function makeDeps(partial: Partial<MirrorDeps> = {}): MirrorDeps {
  return {
    fetchBuffer: async () => ({
      statusCode: 200,
      body: jpegBuffer(),
      contentType: "image/jpeg",
    }),
    headExists: async () => false,
    putObject: async () => ({ url: "https://r2.example/reel-thumbs/abc.jpg" }),
    publicUrl: (key) => `https://r2.example/${key}`,
    sleep: async () => undefined,
    ...partial,
  };
}

describe("viralPosts mediaMirror", () => {
  it("resolves mirrored then source then null", () => {
    expect(
      resolveThumbnailFallback({
        mirroredUrl: "https://r2/x.jpg",
        sourceThumbnailUrl: "https://cdn/x.jpg",
      })
    ).toEqual({
      thumbnailUrl: "https://r2/x.jpg",
      mediaStatus: "mirrored",
    });
    expect(
      resolveThumbnailFallback({
        mirroredUrl: null,
        sourceThumbnailUrl: "https://cdn/x.jpg",
      })
    ).toEqual({
      thumbnailUrl: "https://cdn/x.jpg",
      mediaStatus: "source_fallback",
    });
    expect(
      resolveThumbnailFallback({ mirroredUrl: null, sourceThumbnailUrl: null })
    ).toEqual({ thumbnailUrl: null, mediaStatus: "failed" });
  });

  it("mirrors a valid image successfully", async () => {
    const result = await mirrorOneThumbnail(
      { sourceId: "abc", sourceThumbnailUrl: "https://cdn/x.jpg" },
      makeDeps()
    );
    expect(result.mediaStatus).toBe("mirrored");
    expect(result.thumbnailUrl).toContain("r2.example");
  });

  it("falls back on provider URL timeout and terminates", async () => {
    const result = await mirrorOneThumbnail(
      { sourceId: "abc", sourceThumbnailUrl: "https://cdn/x.jpg" },
      makeDeps({
        fetchBuffer: () =>
          new Promise(() => {
            /* hang */
          }),
      }),
      { fetchTimeoutMs: 50, overallTimeoutMs: 120, maxRetries: 0 }
    );
    expect(result.mediaStatus).toBe("source_fallback");
    expect(result.thumbnailUrl).toBe("https://cdn/x.jpg");
    expect(result.error).toMatch(/TIMEOUT/);
  });

  it("falls back on R2 upload timeout and terminates", async () => {
    const result = await mirrorOneThumbnail(
      { sourceId: "abc", sourceThumbnailUrl: "https://cdn/x.jpg" },
      makeDeps({
        putObject: () =>
          new Promise(() => {
            /* hang */
          }),
      }),
      { uploadTimeoutMs: 50, overallTimeoutMs: 200, maxRetries: 0 }
    );
    expect(result.mediaStatus).toBe("source_fallback");
    expect(result.thumbnailUrl).toBe("https://cdn/x.jpg");
  });

  it("rejects invalid content type with source fallback", async () => {
    const result = await mirrorOneThumbnail(
      { sourceId: "abc", sourceThumbnailUrl: "https://cdn/x.bin" },
      makeDeps({
        fetchBuffer: async () => ({
          statusCode: 200,
          body: Buffer.from("not-an-image"),
          contentType: "application/octet-stream",
        }),
      }),
      { maxRetries: 0 }
    );
    expect(result.mediaStatus).toBe("source_fallback");
    expect(result.error).toMatch(/invalid_content_type/);
  });

  it("rejects oversized file with source fallback", async () => {
    const result = await mirrorOneThumbnail(
      { sourceId: "abc", sourceThumbnailUrl: "https://cdn/x.jpg" },
      makeDeps({
        fetchBuffer: async () => ({
          statusCode: 200,
          body: jpegBuffer(3_000_000),
          contentType: "image/jpeg",
        }),
      }),
      { maxBytes: 1000, maxRetries: 0 }
    );
    expect(result.mediaStatus).toBe("source_fallback");
    expect(result.error).toMatch(/oversized/);
  });

  it("handles provider 403 with source fallback", async () => {
    const result = await mirrorOneThumbnail(
      { sourceId: "abc", sourceThumbnailUrl: "https://cdn/x.jpg" },
      makeDeps({
        fetchBuffer: async () => ({
          statusCode: 403,
          body: Buffer.alloc(0),
          contentType: null,
        }),
      }),
      { maxRetries: 0 }
    );
    expect(result.mediaStatus).toBe("source_fallback");
    expect(result.error).toBe("provider_403");
  });

  it("handles R2 upload rejection with source fallback", async () => {
    const result = await mirrorOneThumbnail(
      { sourceId: "abc", sourceThumbnailUrl: "https://cdn/x.jpg" },
      makeDeps({
        putObject: async () => {
          throw new Error("R2 rejected upload");
        },
      }),
      { maxRetries: 0 }
    );
    expect(result.mediaStatus).toBe("source_fallback");
    expect(result.error).toMatch(/R2 rejected/);
  });

  it("returns failed when no thumbnail available", async () => {
    const result = await mirrorOneThumbnail(
      { sourceId: "abc", sourceThumbnailUrl: null },
      makeDeps()
    );
    expect(result).toEqual({
      sourceId: "abc",
      thumbnailUrl: null,
      mediaStatus: "failed",
    });
  });

  it("bounded batch respects overall budget and terminates", async () => {
    const started = Date.now();
    const results = await mirrorThumbnailsBounded(
      [
        { sourceId: "a", sourceThumbnailUrl: "https://cdn/a.jpg" },
        { sourceId: "b", sourceThumbnailUrl: "https://cdn/b.jpg" },
        { sourceId: "c", sourceThumbnailUrl: "https://cdn/c.jpg" },
      ],
      makeDeps({
        fetchBuffer: () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  statusCode: 200,
                  body: jpegBuffer(),
                  contentType: "image/jpeg",
                }),
              80
            )
          ),
      }),
      {
        overallBudgetMs: 100,
        overallTimeoutMs: 60,
        fetchTimeoutMs: 50,
        maxConcurrency: 1,
        maxRetries: 0,
      }
    );
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.thumbnailUrl != null || r.mediaStatus === "failed")).toBe(
      true
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
