# Watermark cron (Render) — SUPERSEDED

**Superseded by [`watermark-worker.md`](./watermark-worker.md).**

Do **not** create a new Cron Job for watermark processing. Use a Render
**Background Worker** with:

```bash
pnpm tsx scripts/watermark-worker.ts
```

on **Standard (2GB)**. If a Cron Job already exists for
`scripts/process-watermark-jobs.ts`, suspend or delete it so it does not race
the always-on worker.

The one-shot script is kept only for manual/local single-job testing:

```bash
pnpm watermark:cron
```

See `watermark-worker.md` for env vars, behavior, and schema notes.
