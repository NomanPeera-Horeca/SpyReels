export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    service: "spyreels-public-web",
    renderer: "nextjs",
    status: "ok",
    productionRoutesMoved: false,
    gitCommit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
    gitBranch: process.env.RENDER_GIT_BRANCH || null,
  });
}
