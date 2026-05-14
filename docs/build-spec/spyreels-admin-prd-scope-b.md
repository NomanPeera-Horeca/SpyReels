# SpyReels Admin Panel — Scope B PRD (Phase 2)

**Version:** 4 (aligned with `spyreels-admin-prd-v4-consolidated.md`)  
**Tabs:** 4 Emails · 5 Users  
**Visual reference:** `spyreels-admin-mockup-v4.html`  
**Estimated effort:** 10–15 hours over ~3 build days  

---

## 1. Routes & auth

Same `requireAdmin` rules as consolidated §2.1.

Routes in this scope:

- `/admin/emails/*` — Tab 4
- `/admin/users/*` — Tab 5 (including `/admin/users/:id` detail)

---

## 2. Database (Scope B)

| Addition | Purpose |
|----------|---------|
| `email_events` | Every Resend webhook event (persisted, queryable) |
| `email_templates` | Known template metadata (slug, display name, description) |
| `users.isTestAccount` | Test account classification for stats filters |

Resend sends must include **template tags** (`tags: [{ name: "template", value: "<slug>" }]`) for attribution (see consolidated Phase 2 checklist).

---

## 3. Tab 4 — Emails

**Purpose:** Deliverability, per-template stats, bounce visibility.

**UI (summary):**

- Health pulse card (green/amber/red from bounce rate + webhook freshness); optional live pulse dot per design notes.
- Four stat cards: sent, delivery rate, open rate, click rate.
- Per-template performance table with rate bars.
- Recent emails table with filter chips: All / Delivered / Opened / Clicked / Bounced.
- Hard bounce list with manual resolve/remove actions.

**Backend:** Resend webhook endpoint with **signature verification** (Svix/Resend). Daily reconciliation cron optional per consolidated §6.

**Data freshness:** Real-time polling ~30s when tab active; aggregates cached per consolidated §2.4.

**Cross-tab:** Recipient email → open Tab 5 user profile.

---

## 4. Tab 5 — Users

**Purpose:** Plan distribution, consumption, churn, per-user drill-down.

**UI (summary):**

- Four stat cards: total, paid (+ MRR), test accounts, churned.
- Plan distribution donut (segments clickable).
- Consumption: scripts, scrapes, transcriptions (monthly + sparklines).
- 12-month chart: signups vs paid vs cancellations.
- User table: filters, search, row actions.
- **User detail** (`/admin/users/:id`): profile, consumption, email history, activity timeline, admin actions (reset password, mark test, reset limits, force logout, soft delete — implement subset as approved).
- **Exclude test accounts** toggle — **ON by default** everywhere stats apply.

**Cross-tab:** Link from Tab 3 failed scrape (paid user); Tab 4 email timeline deep-link.

---

## 5. Environment variables (Scope B)

`RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY` (existing), plus any internal cron/monitoring URLs per consolidated §5–§6.

---

## 6. Definition of done (Scope B)

- **Emails:** Monday-morning answers: delivery health, template performance, bounces.
- **Users:** MRR/plan/churn visibility; per-user drill-down with email history; test accounts excluded by default.

---

## 7. Reference

Authoritative cross-phase content: **`spyreels-admin-prd-v4-consolidated.md`**.
