# Watermark Background Worker (Render)

Background ffmpeg burns for free/unpaid B-roll clip downloads. Paid users never
hit this pipeline.

**This supersedes the Cron Job setup in `watermark-cron.md`.** Do not run both
a Cron Job and this worker against the same `watermark_jobs` table.

## Why Background Worker

Jobs should start within seconds of enqueue, not wait for the next 1–2 minute
cron tick. An always-on worker polls with a short idle sleep and processes
serially (one encode at a time).

## Why Standard (2GB)

File-based I/O and x264 tuning keep a single short 1080p overlay lighter than
in-buffer ffmpeg paths, but peak RSS (Node + download stream + libx264) is still
tight on 512MB. Scope this worker to **Standard (2GB)** from day one. Do not use
the Starter/512MB tier. Do not run this loop on the web dyno.

## Dashboard setup (manual)

1. Render Dashboard → **New** → **Background Worker** (not Cron Job)
2. Same repo and branch as the web service
3. **Instance type:** Standard (2GB) — set explicitly; code cannot choose this
4. **Build command:** same as web (install deps as needed for `tsx`)
5. **Start command:**

```bash
pnpm tsx scripts/watermark-worker.ts
```

Or: `pnpm watermark:worker`

6. Copy the same env vars the web service needs for MySQL + R2 + Resend:
   - `DATABASE_URL`
   - `CLOUDFLARE_R2_ENDPOINT`
   - `CLOUDFLARE_R2_ACCESS_KEY_ID`
   - `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
   - `CLOUDFLARE_R2_BUCKET`
   - `CLOUDFLARE_R2_PUBLIC_URL`
   - `RESEND_API_KEY`
   - Optional: `WATERMARK_LOGO_PATH` or `WATERMARK_LOGO_URL`
   - Optional: `WATERMARK_WORKER_IDLE_MS` (default `5000`)
   - Optional: `WATERMARK_WORKER_SWEEP_EVERY_MS` (default `60000`)

7. If a Cron Job was previously created for `process-watermark-jobs.ts`,
   **suspend or delete it** so only one consumer claims jobs.

## Behavior

- Serial loop: claim at most one `pending` row, process fully, then look again
- When the queue is empty: sleep `WATERMARK_WORKER_IDLE_MS` (default 5s)
- Zombie sweep (`processing` older than 10 minutes → `failed`) runs only on
  idle ticks, at most once per `WATERMARK_WORKER_SWEEP_EVERY_MS` (default 60s),
  so it does not race an in-flight encode
- Unexpected errors in one iteration are logged; the loop continues
- One-shot script `scripts/process-watermark-jobs.ts` remains for manual/local
  single-job runs (`pnpm watermark:cron`)

## Schema

Apply via Railway MySQL console (Bug #63). Do not `drizzle-kit push` until
schema drift is resolved:

1. `drizzle/0082_watermark_jobs.sql` (create table)
2. `drizzle/0083_watermark_jobs_email_sent_at.sql` (one-shot email guard)

Optional admin catalog: run `pnpm tsx scripts/backfill-email-templates.ts` so
`watermark_download_ready` appears in email_templates.
