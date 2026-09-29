import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const handles = new Set(["charlidamelio", "khaby.lame", "zachking", "mrbeast"]);

export async function GET(request: NextRequest) {
  const handle = (request.nextUrl.searchParams.get("handle") ?? "").trim().toLowerCase();
  if (!handles.has(handle)) return NextResponse.json({ error: "This preview account is unavailable." }, { status: 400 });
  const origin = (process.env.SPYREELS_APP_ORIGIN ?? process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN ?? "https://spyreels.ai").replace(/\/$/, "");
  const input = encodeURIComponent(JSON.stringify({ json: { handle } }));
  try {
    const upstream = await fetch(`${origin}/api/trpc/tiktokScrape.publicDemo?input=${input}`, { headers: { accept: "application/json" }, cache: "no-store" });
    const payload = await upstream.json();
    const data = payload?.result?.data?.json ?? payload?.result?.data;
    if (!upstream.ok || !data || !Array.isArray(data.videos)) throw new Error("Unavailable public preview");
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ error: "TikTok results are unavailable right now. Please try again." }, { status: 502 });
  }
}
