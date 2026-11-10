# Supabase — Website Keyword Monitor

Monitors product pages for **在庫数** inventory alerts and **HTTP 404** maintenance alerts (feature `002-404-maintenance-alert`). See [quickstart for 404 maintenance](../specs/002-404-maintenance-alert/quickstart.md).

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Deno](https://deno.land/) (for local function serve and tests)

## Local setup

Requires Supabase CLI 3.1+ (native stack when Docker is not running) and Deno 2.

```bash
cp supabase/.env.example supabase/.env
# Set ALERT_EMAIL, RESEND_API_KEY, and MONITOR_CRON_SECRET.
# `supabase start` injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

supabase start
```

`supabase start` applies migrations and serves `monitor-check`. Re-run `supabase db reset` to rebuild the local database from migrations.

## Deploy (hosted)

**One-shot (PowerShell, from repo root):**

```powershell
npx supabase login
$env:SUPABASE_PROJECT_REF = "your-project-ref"
Copy-Item supabase\.env.example supabase\.env
# Edit supabase\.env with real values
.\scripts\deploy-supabase.ps1
```

Or step by step:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npx supabase secrets set ALERT_EMAIL=... RESEND_API_KEY=... RESEND_FROM=... MONITOR_CRON_SECRET=...
npx supabase functions deploy monitor-check --no-verify-jwt
```

Schedule hourly checks in **Dashboard → Edge Functions → monitor-check → Schedules**, with header `x-monitor-secret`.

## Test invoke

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/monitor-check" \
  -H "Authorization: Bearer <anon-key>" \
  -H "x-monitor-secret: <MONITOR_CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

## Unit tests

```bash
deno test tests/monitor-check/
```

## Monitored URLs

Edit **Table Editor → `monitored_pages`**. Seed URLs are in migration `20260604000000_monitor_schema.sql`.

## Maintenance 404 alerts

- **HTTP 404** on a monitored URL sends a distinct `[メンテナンス]` email (product may open for sale soon).
- **Dedup**: one email per 404 episode; no repeat while still 404; new email after page recovers (2xx) then 404 again.
- Schema: migration `20260605000000_maintenance_404_schema.sql`.
- Verify state: `SELECT url, maintenance_404_present, notified_while_404 FROM page_watch_state;`
