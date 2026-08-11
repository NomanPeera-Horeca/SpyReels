# Canonical host

Production canonical origin is **https://spyreels.ai** (apex, no `www`).

This matches `SPYREELS_SITE_URL`, sitemap, structured data, and the default
`OAUTH_SERVER_URL`.

## Why

`www.spyreels.ai` and `spyreels.ai` both resolved historically. OAuth callbacks
and AuthDialog redirects that cross hosts wipe `sessionStorage`, which breaks
B-roll preview restore after signup/checkout.

## App redirect

`server/_core/index.ts` 301s any request whose Host / X-Forwarded-Host is
`www.spyreels.ai` to `https://spyreels.ai` with path and query preserved.

## Env checklist

Set in Render (and keep consistent):

- `OAUTH_SERVER_URL=https://spyreels.ai` (not www)
- Google OAuth authorized redirect URI:
  `https://spyreels.ai/api/oauth/callback`
- Prefer attaching the custom domain as apex; keep www only as a redirect
  source if DNS still points both at Render
