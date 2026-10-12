import { resolveServerAppOrigin } from "../appOrigin";
import type { PublicBlogPost } from "./types";

function readTrpcData(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as {
    result?: { data?: { json?: unknown } | unknown };
    error?: unknown;
  };
  if (body.error) return null;
  const data = body.result?.data;
  if (data && typeof data === "object" && "json" in data) {
    return (data as { json?: unknown }).json ?? null;
  }
  return data ?? null;
}

async function fetchTrpcJson(procedure: string, input?: unknown): Promise<unknown> {
  const query =
    input === undefined
      ? ""
      : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const upstreamUrl = `${resolveServerAppOrigin()}/api/trpc/${procedure}${query}`;
  const upstream = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "SpyReels-Public-Web/1.0",
    },
    cache: "no-store",
  });
  if (!upstream.ok) return null;
  const payload = await upstream.json().catch(() => null);
  return readTrpcData(payload);
}

export async function fetchBlogPostBySlug(slug: string): Promise<PublicBlogPost | null> {
  const data = await fetchTrpcJson("blog.bySlug", { slug });
  if (!data || typeof data !== "object") return null;
  return data as PublicBlogPost;
}

export async function fetchPublishedBlogPosts(): Promise<PublicBlogPost[]> {
  const data = await fetchTrpcJson("blog.published");
  if (!Array.isArray(data)) return [];
  return data as PublicBlogPost[];
}
