# Quickstart: Maintenance 404 Alert

**Feature**: `002-404-maintenance-alert`  
**Extends**: `001-website-keyword-monitor`  
**Stack**: Same Supabase Edge Function + PostgreSQL + Resend

## Prerequisites

- Feature `001` deployed (`monitor-check` Edge Function, DB tables, Resend secrets, cron schedule)
- At least one monitored URL that returns HTTP 404 when in maintenance (e.g. OFG shop product pages)

## 1. Apply schema migration

```bash
supabase db push
```

Applies `20260605000000_maintenance_404_schema.sql` (columns on `page_watch_state`, `check_runs`, `check_run_results`).

## 2. Deploy updated Edge Function

```bash
supabase functions deploy monitor-check --no-verify-jwt
```

No new secrets required — uses existing `ALERT_EMAIL`, `RESEND_API_KEY`, `RESEND_FROM`, `MONITOR_CRON_SECRET`.

## 3. Dry-run test

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/monitor-check" \
  -H "x-monitor-secret: your-long-random-secret" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

Inspect JSON response:

- URLs returning **404**: `maintenance_detected: true`, `keyword_found: false`, `http_status: 404`
- New 404 episode: `maintenance_eligible: true`
- Repeat 404 after alert: `maintenance_skip_reason: "already_notified"`
- Recovered page (2xx): `maintenance_detected: false`, inventory fields evaluated as before

Expect `maintenance_urls_alerted: 0` and `maintenance_email_status: "skipped"` in dry run.

## 4. Live maintenance alert

Remove `dry_run` when a URL **newly** returns 404 (first time in current episode).

Expect a **separate** email from inventory alerts:

- **Subject**: `[メンテナンス] N page(s) may open for sale soon` (or equivalent Japanese framing)
- **Body**: List of page URLs (and optional labels)

Inventory `[在庫数]` emails are unchanged and may arrive in the same run for **other** URLs.

## 5. Verify dedup behavior

| Step | URL behavior | Expected emails |
|------|----------------|-----------------|
| 1 | Normal → 404 | One maintenance email |
| 2 | Stays 404 (10 checks) | No more maintenance emails |
| 3 | 404 → 200 (live page) | No maintenance email (episode ended) |
| 4 | 200 → 404 again | Second maintenance email |

```sql
SELECT url, maintenance_404_present, notified_while_404
FROM page_watch_state;

SELECT page_url, http_status, maintenance_detected, maintenance_eligible,
       maintenance_skip_reason, created_at
FROM check_run_results
ORDER BY created_at DESC
LIMIT 20;
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 404 but `maintenance_detected: false` | `http_status` in results — fetch may be timeout/DNS, not 404 |
| No email, `already_notified` | URL still in same 404 episode; wait for 2xx recovery |
| Got inventory email on 404 URL | Bug — 404 must skip keyword parse (FR-011) |
| Maintenance + inventory same URL | Should not happen — 404 takes precedence |

## Related docs

- [spec.md](./spec.md)
- [plan.md](./plan.md)
- [data-model.md](./data-model.md)
- [contracts/](./contracts/)
