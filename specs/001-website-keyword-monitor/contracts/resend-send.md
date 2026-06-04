# Resend integration

**Provider**: [Resend](https://resend.com/docs/api-reference/emails/send-email) (exclusive — no alternate email backend in v1)

## Secrets (Supabase)

| Secret | Purpose |
|--------|---------|
| `RESEND_API_KEY` | Bearer token for Resend API |
| `RESEND_FROM` | Verified sender, e.g. `monitor@yourdomain.com` |
| `ALERT_EMAIL` | Recipient (`to` field) |

## Send call

Edge Function `email.ts` calls:

```http
POST https://api.resend.com/emails
Authorization: Bearer {RESEND_API_KEY}
Content-Type: application/json
```

Body (one email per check run when `urls_alerted > 0`):

```json
{
  "from": "{RESEND_FROM}",
  "to": ["{ALERT_EMAIL}"],
  "subject": "[在庫数] {n} page(s) matched",
  "html": "<!-- per-url sections: url + h4_text -->",
  "text": "<!-- plain-text equivalent -->"
}
```

## Retries

- Retry up to 3 times on HTTP 429, 5xx, or network error
- Backoff: 1s, 2s, 4s
- On final failure: `check_runs.email_status = 'failed'`, do not set `notified_while_present` (allow retry next run)

## SDK option

Deno Edge Function may use `npm:resend` or direct `fetch` to the REST endpoint above.
