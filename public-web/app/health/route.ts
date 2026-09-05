export const dynamic = "force-static";

export function GET() {
  return Response.json({
    service: "spyreels-public-web",
    renderer: "nextjs",
    status: "ok",
    productionRoutesMoved: false,
  });
}
