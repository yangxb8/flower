# Supabase — Website Keyword Monitor

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Deno](https://deno.land/) (for local function serve and tests)

## Local setup

```bash
cd supabase
cp .env.example .env
# Edit .env with local keys from `supabase status`

supabase start
supabase db reset
supabase functions serve monitor-check --env-file .env
```

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
