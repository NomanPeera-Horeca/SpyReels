# Watermark cron (Render)

Background ffmpeg burns for free/unpaid B-roll clip downloads. Paid users never
hit this pipeline.

## Why Standard (2GB)

File-based I/O and x264 tuning keep a single short 1080p overlay lighter than
in-buffer ffmpeg paths, but peak RSS (Node + download stream + libx264) is still
tight on 512MB. Scope this Cron Job to **Standard (2GB)** from day one. Do not
use the default/smallest worker tier.

## Dashboard setup (manual)

1. Render Dashboard → **New** → **Cron Job**
2. Same repo and branch as the web service
3. **Instance type:** Standard (2GB) — set explicitly; code cannot choose this
4. **Schedule:** every 1–2 minutes, e.g. `*/2 * * * *`
5. **Build command:** same as web (or skip if using a prebuilt start-only cron)
6. **Command:**

```bash
pnpm tsx scripts/process-watermark-jobs.ts
```

7. Copy the same env vars the web service needs for MySQL + R2:
   - `DATABASE_URL`
   - `CLOUDFLARE_R2_ENDPOINT`
   - `CLOUDFLARE_R2_ACCESS_KEY_ID`
   - `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
   - `CLOUDFLARE_R2_BUCKET`
   - `CLOUDFLARE_R2_PUBLIC_URL`
   - Optional: `WATERMARK_LOGO_PATH` (local PNG) or `WATERMARK_LOGO_URL`

## Behavior

- Sweeps `processing` rows older than 10 minutes → `failed`
- Claims **exactly one** `pending` row per run
- Downloads source to a temp file, ffmpeg overlay → second temp file, uploads
  to R2, marks `completed` with `outputUrl`, deletes temps (also on failure)

## Schema

Apply via Railway MySQL console (Bug #63). Do not `drizzle-kit push` until
schema drift is resolved:

1. `drizzle/0082_watermark_jobs.sql` (create table)
2. `drizzle/0083_watermark_jobs_email_sent_at.sql` (one-shot email guard)

Optional admin catalog: run `pnpm tsx scripts/backfill-email-templates.ts` (or
the extensions seed) so `watermark_download_ready` appears in email_templates.
