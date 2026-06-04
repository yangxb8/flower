# Contracts

| Artifact | Purpose |
|----------|---------|
| `monitor-check.openapi.yaml` | Edge Function HTTP contract (cron/manual invoke) |
| `alert-email.schema.json` | Internal email batch payload mapped to Resend send body |
| `resend-send.md` | Resend API mapping and env vars |

Invoke URL pattern: `{SUPABASE_URL}/functions/v1/monitor-check` with header `x-monitor-secret: {MONITOR_CRON_SECRET}`.
