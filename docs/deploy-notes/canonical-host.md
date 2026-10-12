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
- Optional: `VITE_APP_ORIGIN=https://app.spyreels.ai` (native builds and non-prod
  preview hosts). Production apex marketing auto-targets `app.spyreels.ai` when
  the page host is `spyreels.ai`. Express serves first-party credentialed CORS
  so those cross-origin API calls succeed.

**spyreels-public-web**

- `NEXT_PUBLIC_SPYREELS_APP_HOST_SPLIT=true`
- `NEXT_PUBLIC_SPYREELS_APP_ORIGIN=https://app.spyreels.ai`
- `SPYREELS_APP_ORIGIN=https://app.spyreels.ai`
- Rebuild after changing `NEXT_PUBLIC_*`
- Browser tRPC (`lib/trpcBrowser.ts`) calls the product API origin when split is on

**Google Cloud OAuth**

- Add authorized redirect: `https://app.spyreels.ai/api/oauth/callback`
- Keep `https://spyreels.ai/api/oauth/callback` during cutover week

**DNS / Render**

1. CNAME `app` → same Render target as apex
2. Add custom domain `app.spyreels.ai` on SpyReels web service
3. Wait for TLS certificate
4. Flip env flags and redeploy SpyReels + public-web

## Express behavior (split on)

- Apex product paths (`/research`, `/studio`, `/api` except `/api/auth` + `/api/oauth` + allowlisted public tRPC + webhooks, etc.) → **302** to `https://app.spyreels.ai` + path/query
- Marketing browsers call **`https://app.spyreels.ai/api/trpc/...`** directly (Vite + public-web). Express answers first-party CORS (`Origin: https://spyreels.ai`, `Access-Control-Allow-Credentials: true`)
- Session cookie `Domain=.spyreels.ai` + `SameSite=Lax` is same-site across apex/app, so credentialed API calls work once CORS is present
- Apex still allowlists a few public tRPC procedures (blog + finder preview) for any relative leftover callers
- Apex `/?auth=login|signup` stays on marketing (Next homepage modal); email `/api/auth/*` stays same-origin on apex
- `app.spyreels.ai` never serves Next marketing HTML
- `app.spyreels.ai/` → `/research` if signed in, else `https://spyreels.ai/`
- `app.spyreels.ai/pricing` (and other marketing paths) → apex
- Signed-in visits to apex `/` → 302 to `https://app.spyreels.ai/research`

## Smoke test

1. `dig app.spyreels.ai` resolves
2. `https://spyreels.ai/` still Next homepage
3. `https://spyreels.ai/research` → 302 → `https://app.spyreels.ai/research`
4. From `https://spyreels.ai/free-tools/viral-hooks`, Network shows tRPC to `https://app.spyreels.ai/api/trpc/...` with status 200 (not Failed to fetch)
5. `https://spyreels.ai/blog` lists posts; hooks / broll / pricing tool actions work
6. `https://spyreels.ai/?auth=signup` stays on apex and opens the Next auth modal
7. After login, user lands on `app.spyreels.ai/research`
8. Session cookie is set for `.spyreels.ai`
