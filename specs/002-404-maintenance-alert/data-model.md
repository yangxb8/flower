# Data Model: Maintenance 404 Alert

**Feature**: `002-404-maintenance-alert`  
**Storage**: Supabase PostgreSQL (extends `001-website-keyword-monitor`)

## Entity relationship

```text
monitored_pages (unchanged)
    │
    └── url aligns with page_watch_state.url and check_run_results.page_url

page_watch_state (extended — inventory + maintenance columns per URL)
    │
    └── referenced by check_run_results.page_url (logical FK)

check_runs (extended — dual email status fields)
    │
    └── 1:N check_run_results (extended — maintenance outcome columns)
```

## Schema changes (migration)

### `page_watch_state` — new columns

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `maintenance_404_present` | `boolean` | NOT NULL, default `false` | Last check: URL returned HTTP 404 |
| `notified_while_404` | `boolean` | NOT NULL, default `false` | Maintenance email sent for current 404 episode |

Existing inventory columns (`keyword_present`, `notified_while_present`, `last_h4_text`) unchanged.

**Maintenance state machine (per URL)**

| Previous `maintenance_404_present` | Check HTTP outcome | New `maintenance_404_present` | `notified_while_404` | Maintenance email? |
|--------------------------------------|-------------------|------------------------------|----------------------|-------------------|
| false / null | 404 | true | true (set on send) | **Yes** |
| true | 404 | true | true (unchanged) | No |
| true | 2xx (recovery) | false | false (reset) | No |
| false | 2xx | false | false | No |
| any | non-404 error / timeout | *unchanged* | *unchanged* | No |

After recovery (2xx), a later 404 starts a new episode → eligible again.

### `check_runs` — new columns

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `maintenance_urls_alerted` | `integer` | NOT NULL, default `0` | URLs in maintenance batch this run |
| `maintenance_email_status` | `text` | nullable | `sent`, `skipped`, `failed`, `not_needed` |

Existing `urls_alerted` / `email_status` remain **inventory-only**.

### `check_run_results` — new columns

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `http_status` | `integer` | nullable | Response status when HTTP response received |
| `maintenance_detected` | `boolean` | NOT NULL, default `false` | `http_status = 404` |
| `maintenance_eligible` | `boolean` | NOT NULL, default `false` | Passed maintenance disappear→reappear gate |
| `maintenance_sent` | `boolean` | NOT NULL, default `false` | Included in maintenance batch email |
| `maintenance_skip_reason` | `text` | nullable | e.g. `already_notified`, `not_404`, `fetch_error` |

Existing inventory columns unchanged. When `maintenance_detected` is true, inventory fields stay false/null (`keyword_found`, `structure_ok`, `alert_eligible`).

## Per-run processing rules

1. **HTTP 404**: Set `maintenance_detected=true`; run maintenance dedup; skip inventory parse (FR-011).
2. **HTTP 2xx**: Decode body → inventory parse + dedup; set `maintenance_404_present=false` on state upsert (recovery).
3. **Other**: `fetch_status=error`; log `http_status` if known; do not advance maintenance or inventory notified flags.

## Indexes

No new indexes required (same query patterns as 001).

## Retention

Unchanged from 001: `check_runs` / `check_run_results` purged after 30 days; `page_watch_state` retained indefinitely.

## Validation rules

- At most one maintenance email batch per `check_runs` when `maintenance_urls_alerted > 0`.
- `notified_while_404` MUST reset to `false` when `maintenance_404_present` becomes `false` (2xx recovery).
- `notified_while_404` MUST NOT advance to `true` unless maintenance email send succeeds (same rule as inventory).
- Same URL MUST NOT have `maintenance_eligible=true` and `alert_eligible=true` in the same result row.
