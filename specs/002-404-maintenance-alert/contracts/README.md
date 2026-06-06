# Contracts: Maintenance 404 Alert

Extends feature `001-website-keyword-monitor` contracts.

| File | Purpose |
|------|---------|
| `monitor-check.openapi.yaml` | Edge Function response adds maintenance email fields and per-URL maintenance outcome |
| `maintenance-email.schema.json` | Resend payload shape for maintenance batch emails |

Invoke URL unchanged: `{SUPABASE_URL}/functions/v1/monitor-check` with `x-monitor-secret`.
