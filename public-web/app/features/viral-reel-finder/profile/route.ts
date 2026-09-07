import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/^@+/, "").toLowerCase();
}

function validHandle(handle: string): boolean {
  return /^[a-z0-9._]{1,30}$/i.test(handle);
}

function appOrigin(): string {
  return (
    process.env.SPYREELS_APP_ORIGIN ??
    process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN ??
    "https://spyreels.ai"
  ).replace(/\/$/, "");
}

function readTrpcData(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as {
    result?: { data?: { json?: unknown } | unknown };
  };
  const data = body.result?.data;
  if (data && typeof data === "object" && "json" in data) {
    return (data as { json?: unknown }).json ?? null;
  }
  return data ?? null;
}

export async function GET(request: NextRequest) {
  const handle = normalizeHandle(request.nextUrl.searchParams.get("handle") ?? "");
  if (!validHandle(handle)) {
    return NextResponse.json({ found: false, error: "Enter a valid Instagram username." }, { status: 400 });
  }

  const input = encodeURIComponent(JSON.stringify({ json: { handle } }));
  const upstreamUrl = `${appOrigin()}/api/trpc/featured.publicProfilePreview?input=${input}`;
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
        ...(realIp ? { "x-real-ip": realIp } : {}),
        "user-agent": "SpyReels-Public-Web/1.0",
      },
      cache: "no-store",
    });

    const payload = await upstream.json().catch(() => null);
    const data = readTrpcData(payload);
    if (!upstream.ok || !data) {
      return NextResponse.json(
        { found: false, error: "We could not find that Instagram account." },
        { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 }
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[ViralFinderProfile] Upstream request failed:", error);
    return NextResponse.json(
      { found: false, error: "Instagram lookup is unavailable right now." },
      { status: 502 }
    );
  }
}
