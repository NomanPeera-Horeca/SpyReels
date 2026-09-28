import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function appOrigin(): string {
  return (
    process.env.SPYREELS_APP_ORIGIN ??
    process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN ??
    "https://spyreels.ai"
  ).replace(/\/$/, "");
}

function readTrpcData(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { result?: { data?: { json?: unknown } | unknown } }).result?.data;
  return data && typeof data === "object" && "json" in data
    ? (data as { json?: unknown }).json ?? null
    : data ?? null;
}

export async function GET(request: NextRequest) {
  const handle = (request.nextUrl.searchParams.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) {
    return NextResponse.json({ error: "Enter a valid Instagram username." }, { status: 400 });
  }

  const input = encodeURIComponent(JSON.stringify({ json: { handle } }));
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  try {
    const upstream = await fetch(
      `${appOrigin()}/api/trpc/featured.publicFinderSearch?input=${input}`,
      {
        headers: {
          accept: "application/json",
          ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
          ...(realIp ? { "x-real-ip": realIp } : {}),
          "user-agent": "SpyReels-Public-Web/1.0",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(35_000),
      }
    );
    const payload = await upstream.json().catch(() => null);
    const data = readTrpcData(payload);
    if (!upstream.ok || !data) {
      const message = (payload as { error?: { message?: string } } | null)?.error?.message;
      return NextResponse.json(
        { error: message ?? "Reel search is unavailable right now. Please try again." },
        { status: upstream.status === 429 ? 429 : upstream.status === 400 ? 400 : 502 }
      );
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=0, no-store" },
    });
  } catch (error) {
    console.error("[ViralFinderSearch] Upstream request failed:", error);
    return NextResponse.json(
      { error: "Reel search is unavailable right now. Please try again." },
      { status: 502 }
    );
  }
}
