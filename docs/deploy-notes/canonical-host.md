# Canonical hosts

## Production layout (host split)

When `SPYREELS_APP_HOST_SPLIT=true`:

| Host | Role |
|------|------|
| **https://spyreels.ai** | Marketing / SEO (Next public-web via Express proxy) |
| **https://app.spyreels.ai** | Product SPA + `/api` + Google OAuth |
| **www.spyreels.ai** | 301 → apex |

Session cookies use `Domain=.spyreels.ai` so apex and app share login.

When the flag is **off** (default until DNS is ready), both marketing and product stay on apex.

## Why the split

Mature SaaS pattern: acquisition on the apex domain, product on `app.`.
OAuth callbacks and AuthDialog redirects that cross unrelated hosts wipe
`sessionStorage`; keeping OAuth on the product host avoids that.

## Auth UX

- Log in / Start free stay on **apex** (`/?auth=…`) so the Next homepage modal opens over the new marketing UI.
- Email auth APIs (`/api/auth/*`) are allowed on apex (not redirected).
- Google OAuth still starts/finishes on **app** (`OAUTH_SERVER_URL`).
- After email login, the client navigates to `https://app.spyreels.ai` + returnTo.
- Session cookie uses `Domain=.spyreels.ai` so both hosts share login.

## Env checklist (cutover)

After DNS + Render custom domain + Google OAuth URI are ready:

**SpyReels web service**

- `SPYREELS_APP_HOST_SPLIT=true`
- `SPYREELS_SITE_URL=https://spyreels.ai`
- `SPYREELS_APP_ORIGIN=https://app.spyreels.ai`
- `OAUTH_SERVER_URL=https://app.spyreels.ai`
- Prefer `VITE_APP_ORIGIN=https://app.spyreels.ai` for native/Capacitor builds

**spyreels-public-web**

- `NEXT_PUBLIC_SPYREELS_APP_HOST_SPLIT=true`
- `NEXT_PUBLIC_SPYREELS_APP_ORIGIN=https://app.spyreels.ai`
- `SPYREELS_APP_ORIGIN=https://app.spyreels.ai`
- Rebuild after changing `NEXT_PUBLIC_*`

**Google Cloud OAuth**

- Add authorized redirect: `https://app.spyreels.ai/api/oauth/callback`
- Keep `https://spyreels.ai/api/oauth/callback` during cutover week

**DNS / Render**

1. CNAME `app` → same Render target as apex
2. Add custom domain `app.spyreels.ai` on SpyReels web service
3. Wait for TLS certificate
4. Flip env flags and redeploy SpyReels + public-web

## Express behavior (split on)

- Apex product paths (`/research`, `/studio`, `/api` except `/api/auth` + `/api/oauth` + public marketing tRPC, etc.) → **302** to `https://app.spyreels.ai` + path/query
- Apex keeps same-origin public tRPC for Finder profile preview and blog (`blog.published`, `blog.bySlug`) so the marketing SPA is not broken by a cross-origin redirect
- Apex `/?auth=login|signup` stays on marketing (Next homepage modal)
- `app.spyreels.ai` never serves Next marketing HTML
- `app.spyreels.ai/` → `/research` if signed in, else `https://spyreels.ai/`
- `app.spyreels.ai/pricing` (and other marketing paths) → apex
- Signed-in visits to apex `/` → 302 to `https://app.spyreels.ai/research`

## Smoke test

1. `dig app.spyreels.ai` resolves
2. `https://spyreels.ai/` still Next homepage
3. `https://spyreels.ai/research` → 302 → `https://app.spyreels.ai/research`
4. `https://spyreels.ai/api/trpc/blog.published` stays on apex (no 302) and returns posts
5. `https://spyreels.ai/blog` lists published posts in the browser
6. `https://spyreels.ai/?auth=signup` stays on apex and opens the Next auth modal
7. After login, user lands on `app.spyreels.ai/research`
8. Session cookie is set for `.spyreels.ai`
