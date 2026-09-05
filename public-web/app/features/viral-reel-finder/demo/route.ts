import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEMO_HANDLES = new Set([
  "garyvee",
  "humphreytalks",
  "russellbrunson",
  "codiesanchez",
]);

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/^@+/, "").toLowerCase();
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
  const handle = normalizeHandle(request.nextUrl.searchParams.get("handle") ?? "garyvee");

  if (!DEMO_HANDLES.has(handle)) {
    return NextResponse.json(
      { error: "This preview handle is not available." },
      { status: 400 }
    );
  }

  const input = encodeURIComponent(JSON.stringify({ json: { handle } }));
  const upstreamUrl = `${appOrigin()}/api/trpc/featured.publicDemo?input=${input}`;

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
        { error: "The demo catalog is unavailable right now." },
        { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 }
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[ViralFinderDemo] Upstream request failed:", error);
    return NextResponse.json(
      { error: "The demo catalog is unavailable right now." },
      { status: 502 }
    );
  }
}
