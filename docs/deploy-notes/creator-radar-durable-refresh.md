# Creator Radar durable refresh

Creator Radar Refresh used to enqueue work only in an in-memory promise chain on
the web process. Deploys killed that queue and left scrape rows `pending` /
Queued at 0% until the zombie sweeper (about 30 minutes).

## Current design

1. Refresh API sets the platform scrape job to `pending` (UI source of truth).
2. `scheduleCreatorRadarRefresh` inserts/requeues a `durable_jobs` row with
   `jobType = creator_radar_refresh` and a stable idempotency key
   `creator_radar_refresh:{platform}:{jobId}`.
3. A **serial web claim loop** (`startCreatorRadarRefreshWorker`) claims only
   that job type, heartbeats a 15-minute lease, and runs the existing
   Instagram / TikTok / YouTube refresh runners.
4. After a deploy, the next web boot resumes any still-queued durable jobs.
   The in-memory path is no longer the source of truth.

## Env

| Variable | Default | Meaning |
|---|---|---|
| `DURABLE_QUEUE_CREATOR_RADAR_REFRESH_ENABLED` | on (unless `false`) | Durable path. Set `false` to force legacy in-memory queue. |
| `CREATOR_RADAR_REFRESH_WEB_WORKER` | on (unless `false`) | Start the serial claimer on the web process. |
| `CREATOR_RADAR_REFRESH_POLL_MS` | `1000` | Idle poll interval. |
| `CREATOR_RADAR_REFRESH_LEASE_SECONDS` | `900` | Claim lease; heartbeats renew it. |

Requires the existing `durable_jobs` table (`drizzle/0096b_durable_jobs.sql`).

## Later (optional dedicated worker)

When you want Creator Radar off the web dyno:

1. Set `CREATOR_RADAR_REFRESH_WEB_WORKER=false` on web.
2. Run `dist/worker` (or `pnpm tsx server/durableJobs/worker.ts`) with a
   claim filter that **includes** `creator_radar_refresh` (today the general
   pilot worker excludes that type so it does not race the web poller).
3. Keep provider concurrency at 1 (serial) unless you intentionally raise it.
