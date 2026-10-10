import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const handles = new Set(["charlidamelio", "khaby.lame", "mrbeast"]);

export async function GET(request: NextRequest) {
  const handle = (request.nextUrl.searchParams.get("handle") ?? "").trim().toLowerCase();
  if (!handles.has(handle)) return NextResponse.json({ error: "This preview account is unavailable." }, { status: 400 });

  const origin = (process.env.SPYREELS_APP_ORIGIN ?? process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN ?? "https://spyreels.ai").replace(/\/$/, "");
  const input = encodeURIComponent(JSON.stringify({ json: { handle } }));
  const forwardedFor = request.headers.get("x-forwarded-for");

  try {
    const upstream = await fetch(`${origin}/api/trpc/tiktokScrape.publicDemo?input=${input}`, {
      headers: { accept: "application/json", ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}), "user-agent": "SpyReels-Public-Web/1.0" },
      cache: "no-store",
      // Catalog is DB-backed; keep a short guard so a stuck upstream never hangs the page.
      signal: AbortSignal.timeout(3_000),
    });
    const envelope = await upstream.json().catch(() => null);
    const data = envelope?.result?.data?.json ?? envelope?.result?.data;
    if (!upstream.ok || !data || !Array.isArray(data.videos)) {
      const message = upstream.status === 429 ? "Too many searches. Please try again in a minute." : "TikTok results are unavailable right now. Please try again.";
      return NextResponse.json({ error: message }, { status: upstream.status === 429 ? 429 : 503 });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ error: "TikTok results are unavailable right now. Please try again." }, { status: 503 });
  }
}
