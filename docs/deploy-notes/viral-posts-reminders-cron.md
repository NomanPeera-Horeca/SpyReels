# Viral Posts Reminders Cron (Render)

Daily job that regenerates Viral Posts feeds and emails reminders:

- **Paid:** refresh feed if `last_feed_generated_at` is null or older than 7 days, then send `viral_posts_paid_reminder`
- **Unpaid:** staged drip on days `[1, 2, 7, 14, 30]` (capped at stage 5 / every 30 days), only while the user stays inactive for that threshold; send `viral_posts_unpaid_reminder`

Any authenticated activity resets unpaid drip stage to 0 via `recordUserActivity`.

## Dashboard setup (manual)

1. Render Dashboard → **New** → **Cron Job**
2. Same repo and branch as the web service
3. **Schedule:** once daily, early morning UTC (example: `0 6 * * *`)
4. **Build command:** same as web (install deps as needed for `tsx`)
5. **Command:**

```bash
pnpm exec tsx scripts/viral-posts-reminders.ts
```

6. Copy env vars the web service needs for MySQL + Resend + Viral Posts:

   - `DATABASE_URL`
   - `RESEND_API_KEY`
   - Same Viral Posts / feature-flag env the web service uses so feed assembly can run (e.g. pool / platform flags already required by `getOrCreateDailyFeed`)

## Behavior

- Loads all users with a LEFT JOIN on `viral_post_reminder_state` (missing row = stage 0)
- Skips users with no email (no unsubscribe / opt-out column on `users` today)
- Per-user try/catch: one failure does not stop the batch
- Prints a JSON summary: `paidRegenerated`, `unpaidRegenerated`, `skippedNoEmail`, `errors`, `scanned`
- Uses each user's stored `users.timezone` (default `UTC`) for the local feed date
- Force-regenerates via shared `getOrCreateDailyFeed({ force: true })` (same path as the tRPC handler)

## Schema

Applied via Railway MySQL console (Bug #63). Do not `drizzle-kit migrate` / push for this:

1. `users.timezone` VARCHAR(64) nullable
2. `viral_post_reminder_state` (`user_id` PK, `reminder_stage`, `last_reminder_sent_at`, `last_feed_generated_at`, `updated_at`)

Drizzle mirrors live in `drizzle/schema.ts` only.
