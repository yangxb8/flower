# Quickstart: Website Keyword Monitor

**Feature**: `001-website-keyword-monitor`  
**Stack**: Supabase Edge Functions + PostgreSQL + Resend

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in
- Supabase project (local or hosted)
- Resend account with verified sender domain
- Target URLs reachable from Supabase Edge (public HTTP)

## 1. Initialize Supabase (if not present)

```bash
supabase init
```

Apply the monitor schema migration from `supabase/migrations/` (created during `/speckit-implement`).

## 2. Configure secrets

```bash
supabase secrets set \
  ALERT_EMAIL=you@example.com \
  RESEND_API_KEY=re_xxxx \
  RESEND_FROM=monitor@yourdomain.com \
  MONITOR_CRON_SECRET=your-long-random-secret
```

Monitored URLs live in the **`monitored_pages`** table (not env vars).

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically in hosted Edge Functions.

## 3. Deploy Edge Function

```bash
supabase functions deploy monitor-check --no-verify-jwt
```

`--no-verify-jwt` is typical for cron-invoked functions that use `x-monitor-secret` instead.

## 4. Manual test run

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/monitor-check" \
  -H "Authorization: Bearer <anon-or-service-key>" \
  -H "x-monitor-secret: your-long-random-secret" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

Expect JSON with `run_id`, per-URL `results`, and `urls_alerted: 0` in dry run (no email).

Remove `dry_run` to send email when URLs are newly eligible.

## 5. Schedule hourly checks

**Option A — Supabase Dashboard**: Project → Edge Functions → `monitor-check` → Schedules → add cron `0 * * * *` with secret header.

**Option B — pg_cron + pg_net**: See migration comments in `20260604000000_monitor_schema.sql` for SQL that POSTs to the function URL with `x-monitor-secret`.

## 6. Manage monitored URLs (Supabase Table Editor)

Open **Table Editor → `monitored_pages`**. Add, edit, or disable rows; changes apply on the next check run (no function redeploy).

**Initial seed** (from migration):

| url | enabled |
|-----|---------|
| `https://ofg-web-shop.com/?pid=176762784` | true |
| `https://ofg-web-shop.com/?pid=165901954` | true |

Example — add a page:

```sql
INSERT INTO monitored_pages (url, label, enabled)
VALUES ('https://ofg-web-shop.com/?pid=999999999', 'New product', true);
```

Example — temporarily disable:

```sql
UPDATE monitored_pages SET enabled = false WHERE url LIKE '%pid=176762784%';
```

Verify:

```sql
SELECT id, url, enabled, label FROM monitored_pages ORDER BY created_at;
```

## 7. Verify dedup behavior

1. Run check while page shows 在庫数 → receive email.
2. Run again without page change → no email (`skip_reason: already_notified`).
3. Simulate or wait until keyword absent on page → run check (state resets).
4. When keyword returns → new email.

Inspect state:

```sql
SELECT * FROM page_watch_state;
SELECT * FROM check_run_results ORDER BY created_at DESC LIMIT 20;
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| No email, `structure_ok: false` | Page missing `div.flr` or `h4` |
| No email, `skip_reason: already_notified` | Keyword still present from prior alert |
| 401 on invoke | `x-monitor-secret` mismatch |
| Fetch errors | URL blocked, timeout — see `check_run_results.fetch_status` |

## Related docs

- [plan.md](./plan.md)
- [data-model.md](./data-model.md)
- [contracts/monitor-check.openapi.yaml](./contracts/monitor-check.openapi.yaml)
