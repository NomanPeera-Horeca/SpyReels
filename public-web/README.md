# SpyReels Public Web v2

This directory is the isolated Next.js renderer for SpyReels public acquisition pages.

## Current milestone

Foundation only. No production SpyReels route is routed here yet.

- Existing Express/tRPC backend stays in place.
- Existing Vite React product application stays in place.
- Public route ownership is defined in `shared/publicRouteOwnership.ts`.
- This runtime currently blocks indexing on purpose.

## Why this exists

Public marketing and blog pages must return their meaningful content, headings, metadata and internal links in the initial HTML response. Interactive islands can hydrate afterward. Product screens can continue to be client-rendered in the existing SPA.

## Local run

```bash
cd public-web
pnpm install
pnpm dev
```

The isolated runtime listens on `http://localhost:3100` and exposes `GET /health`.

## Visual QA (CI safety net)

Linux Docker baselines are the source of truth (same image as GitHub Actions). See [docs/PUBLIC_WEB_VISUAL_CI.md](../docs/PUBLIC_WEB_VISUAL_CI.md).

```bash
# Update Linux baselines (one command)
pnpm test:visual:update:docker

# Compare against Linux baselines
pnpm test:visual:docker
```

Optional macOS Chrome baselines: `pnpm test:visual` / `pnpm test:visual:update` (writes `*-darwin.png` only; CI does not use them).

## Guardrails

Do not route production traffic here until the Viral Reel Finder pilot passes all acceptance checks:

1. Raw HTML contains the page's meaningful visible copy and crawlable links.
2. JavaScript-disabled rendering still explains what the page is and how it works.
3. Canonical, metadata and structured data are correct server-side.
4. Interactive search/hydration works without changing the user flow.
5. Auth handoff to the existing SpyReels application still works.
6. Analytics attribution continues to work.
7. Existing app routes are untouched.
8. Only after the pilot is accepted should Express hand a production public route to this renderer.

## Version choice

Next.js is pinned to 16.3.3, the current Active LTS security release selected for this foundation. React matches the existing SpyReels React 19.2.1 runtime.
