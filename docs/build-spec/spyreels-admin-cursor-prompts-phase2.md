# Cursor prompts — Admin Panel Phase 2 (Scope B)

Use with repo root `~/Desktop/reels-dashboard`. PRD: `docs/build-spec/spyreels-admin-prd-scope-b.md` + `spyreels-admin-prd-v4-consolidated.md`. Mockup: `docs/build-spec/spyreels-admin-mockup-v4.html`.

---

## Prompt 1 — Phase 2 migrations

Add Drizzle migrations for `email_events`, `email_templates`, and `users.isTestAccount`. Seed or backfill `email_templates` for each known Resend template slug. Ensure indexes support time-range queries and lookups by `userId` / email where applicable.

---

## Prompt 2 — Resend webhook

Implement POST webhook handler for Resend (or Svix-verified equivalent): verify signature, normalize payload, insert `email_events` idempotently (dedupe by provider ids). Return appropriate HTTP statuses. Document `RESEND_WEBHOOK_SECRET` in `.env.example`.

---

## Prompt 3 — Template tags on all sends

Ensure every `resend.emails.send` call passes `tags: [{ name: "template", value: "<slug>" }]`. Keep slugs aligned with `email_templates`. Add CI or script check if not already present so regressions fail `pnpm check`.

---

## Prompt 4 — Tab 4 Emails dashboard

Build `/admin/emails`: health pulse card, aggregate stats (sent, delivery/open/click rates), per-template table, recent events with filter chips, hard bounce list with resolve/remove actions. Poll active tab ~30s; align caching with consolidated freshness table.

---

## Prompt 5 — Tab 5 Users dashboard

Build `/admin/users`: stat cards (total, paid+MRR, tests, churned), plan donut, consumption sparklines, 12-month signup/paid/cancel chart, filterable user table. Default **exclude test accounts** ON for aggregates.

---

## Prompt 6 — User detail

Implement `/admin/users/:id`: profile, consumption, email timeline (from `email_events`), activity timeline, admin actions you already support in backend (password reset, mark test, limits, logout, soft delete — gate dangerous actions behind confirm modals).

---

## Prompt 7 — Cross-links & reconciliation

Link Tab 4 recipient → Tab 5 user. Link Tab 3 failed scrape → Tab 5 when subscriber is paid. Optional: daily Resend reconciliation job (GET emails) to backfill missed webhooks per consolidated §6.

---

## Prompt 8 — QA

Test webhook with Resend CLI or fixture payloads. Verify template stats match tagged sends. Confirm test-account toggle changes charts and tables consistently.
