# Google Search Console verification (never remove)

Google verifies `spyreels.ai` with an HTML file at the site root:

- **URL:** `https://spyreels.ai/googleabadefc43201e81e.html`
- **Body (exact, no trailing newline):** `google-site-verification: googleabadefc43201e81e.html`

## Where the file lives

| Stack | Path |
|---|---|
| Express / Vite (production SPA static) | `client/public/googleabadefc43201e81e.html` |
| Next public-web | `public-web/public/googleabadefc43201e81e.html` |

Apex traffic for this path is served by the **SpyReels web** Express static layer (it is not a public-web pilot route). Keep both copies so a future Next-only origin still verifies.

## Rules

1. **Never delete or rename** these files.
2. **Never change the body** unless Google issues a new verification token.
3. After deploy, confirm: `curl -sS https://spyreels.ai/googleabadefc43201e81e.html` returns the exact body with HTTP 200 and no redirect.

## Deploy

Redeploy **SpyReels web** (required for apex). Redeploy **spyreels-public-web** as well so the Next service stays in sync.
