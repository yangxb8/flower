# Research: Website Keyword Monitor

**Feature**: `001-website-keyword-monitor`  
**Date**: 2026-06-04

## R1: Runtime platform

| | |
|---|---|
| **Decision** | Supabase Edge Functions (Deno) + PostgreSQL for state and logs |
| **Rationale** | User mandate; Edge Functions suit scheduled HTTP fetch + email; Postgres gives durable per-URL notification state across invocations |
| **Alternatives considered** | External VPS cron + script (more ops); GitHub Actions schedule (weaker DB coupling); Supabase only without DB (cannot enforce disappear/reappear dedup reliably) |

## R2: Scheduling

| | |
|---|---|
| **Decision** | `pg_cron` invoking Edge Function via `pg_net` HTTP POST, or Supabase Dashboard cron trigger to `monitor-check` |
| **Rationale** | Hourly (configurable) checks without a always-on server; aligns with Supabase stack |
| **Alternatives considered** | Edge Function `setInterval` (not valid in serverless); external cron hitting function URL (works but duplicates Supabase-native options) |

## R3: HTML fetch and extraction

| | |
|---|---|
| **Decision** | `fetch()` per URL with timeout; parse HTML with `linkedom` (Deno-compatible); query `div.flr h4` text nodes |
| **Rationale** | Spec requires structured extraction, not regex on raw HTML; linkedom is lightweight for Edge Function limits |
| **Alternatives considered** | Regex-only (fragile for nested markup); full browser render (overkill, not available in Edge) |

## R4: Keyword detection

| | |
|---|---|
| **Decision** | Literal substring search for `在庫数` on decoded response body (UTF-8); match only counts if `div.flr` contains at least one `h4` with non-empty text |
| **Rationale** | Matches clarified spec; avoids alerting when keyword appears outside target structure |
| **Alternatives considered** | DOM text-only search excluding script tags (optional refinement in implement phase) |

## R5: Notification deduplication (authoritative for implementation)

| | |
|---|---|
| **Decision** | **Disappear → reappear** gate per URL, persisted in DB. Email sent only when URL transitions from “keyword absent” (or never seen) to “keyword present with valid extraction”. While keyword stays present, no further emails. When keyword disappears on a later check, state resets so the next presence triggers a new email. |
| **Rationale** | User plan input: avoid spam unless keyword leaves page then returns; simpler mental model than excerpt-diff |
| **Alternatives considered** | `<h4>` text diff (in spec User Story 2 — superseded for v1 by plan decision; optional future enhancement) |

## R6: Email delivery

| | |
|---|---|
| **Decision** | **Resend** — `POST https://api.resend.com/emails` from Edge Function; credentials via Supabase secrets (`RESEND_API_KEY`, `RESEND_FROM`) |
| **Rationale** | Operator-confirmed provider; simple HTTP API, Deno-friendly, supports HTML/text batch content for multi-URL alerts |
| **Alternatives considered** | SendGrid, raw SMTP (rejected — Resend is the chosen provider) |

## R7: Configuration source

| | |
|---|---|
| **Decision** | **URLs**: `monitored_pages` table in Postgres, edited in Supabase Table Editor. **Secrets/env**: `ALERT_EMAIL`, `RESEND_*`, `MONITOR_CRON_SECRET`, optional `FETCH_TIMEOUT_MS`. Seed: OFG shop URLs `?pid=176762784` and `?pid=165901954`. |
| **Rationale** | Operator request — change pages without redeploying function; still no custom admin app |
| **Alternatives considered** | `MONITOR_URLS` env JSON (rejected — superseded); public REST API for URL CRUD (rejected) |

## R8: Observability and retention

| | |
|---|---|
| **Decision** | `check_runs` + `check_run_results` tables; optional purge job for rows older than 30 days |
| **Rationale** | FR-011; supports debugging without external log stack |
| **Alternatives considered** | Edge Function logs only (no structured per-URL history) |

## R9: Service role and security

| | |
|---|---|
| **Decision** | Edge Function uses `SUPABASE_SERVICE_ROLE_KEY` for DB writes; cron invoke uses shared secret header `x-monitor-secret` verified in function |
| **Rationale** | Prevents public invocation spam; service role needed for inserting run logs |
| **Alternatives considered** | Anon key + RLS only (RLS can work but cron + logging is simpler with service role in trusted function) |
