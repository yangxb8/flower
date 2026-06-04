# Data Model: Website Keyword Monitor

**Feature**: `001-website-keyword-monitor`  
**Storage**: Supabase PostgreSQL

## Entity relationship

```text
monitored_pages (operator-managed URL list)
    │
    └── url aligns with page_watch_state.url and check_run_results.page_url

page_watch_state (1 per monitored URL)
    │
    └── referenced by check_run_results.page_url (logical FK)

check_runs (1 per scheduled invocation)
    │
    └── 1:N check_run_results
```

## Tables

### `monitored_pages`

Operator-managed list of pages to check. Edited via **Supabase Table Editor** (not Edge Function API).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Row id |
| `url` | `text` | NOT NULL, UNIQUE | Full page URL to fetch |
| `label` | `text` | nullable | Optional note (e.g. product name) |
| `enabled` | `boolean` | NOT NULL, default `true` | If false, skip on check runs |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Initial seed data** (migration):

| url | enabled |
|-----|---------|
| `https://ofg-web-shop.com/?pid=176762784` | true |
| `https://ofg-web-shop.com/?pid=165901954` | true |

Edge Function loads: `SELECT url FROM monitored_pages WHERE enabled = true ORDER BY created_at`.

### `page_watch_state`

Tracks notification eligibility per URL (dedup: disappear → reappear).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `url` | `text` | PK | Normalized monitored URL |
| `keyword_present` | `boolean` | NOT NULL, default `false` | Last successful check: `在庫数` found in page body |
| `notified_while_present` | `boolean` | NOT NULL, default `false` | Email already sent for current “presence episode” |
| `last_h4_text` | `text` | nullable | Last extracted `div.flr h4` text (audit/debug) |
| `last_checked_at` | `timestamptz` | nullable | Last successful fetch attempt |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Row touch time |

**State machine (per URL)**

| Previous `keyword_present` | Check result | New `keyword_present` | `notified_while_present` | Email? |
|----------------------------|--------------|----------------------|--------------------------|--------|
| false / null | absent | false | false | No |
| false / null | present + valid h4 | true | true (set on send) | **Yes** |
| true | present | true | true (unchanged) | No |
| true | absent | false | false (reset) | No |
| false (after absent) | present + valid h4 | true | true | **Yes** |

“Present + valid h4” = keyword in HTML AND ≥1 non-empty `h4` inside `div.flr`.

### `check_runs`

One row per Edge Function invocation (scheduled or manual).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Run identifier |
| `started_at` | `timestamptz` | NOT NULL | Run start |
| `finished_at` | `timestamptz` | nullable | Run end |
| `status` | `text` | NOT NULL | `running`, `completed`, `failed` |
| `urls_configured` | `integer` | NOT NULL | Count of enabled `monitored_pages` rows |
| `urls_alerted` | `integer` | NOT NULL, default 0 | Count emailed this run |
| `email_status` | `text` | nullable | `sent`, `skipped`, `failed`, `not_needed` |
| `error_summary` | `text` | nullable | Top-level failure message |

### `check_run_results`

Per-URL outcome for a run.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `run_id` | `uuid` | FK → `check_runs.id` ON DELETE CASCADE | |
| `page_url` | `text` | NOT NULL | |
| `fetch_status` | `text` | NOT NULL | `ok`, `error` |
| `keyword_found` | `boolean` | NOT NULL | Body contains `在庫数` |
| `structure_ok` | `boolean` | NOT NULL | `div.flr` + `h4` extracted |
| `h4_text` | `text` | nullable | Concatenated h4 texts if multiple |
| `alert_eligible` | `boolean` | NOT NULL | Passed disappear→reappear gate |
| `alert_sent` | `boolean` | NOT NULL, default false | Included in batch email |
| `skip_reason` | `text` | nullable | e.g. `already_notified`, `keyword_absent`, `missing_structure`, `fetch_error` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

## Indexes

- `monitored_pages(enabled)` where `enabled = true` (partial index optional)
- `check_run_results(run_id)`
- `check_run_results(page_url, created_at DESC)` — recent history per URL
- `page_watch_state(last_checked_at)`

## Retention

- Scheduled SQL or monthly Edge Function: delete `check_runs` / `check_run_results` older than 30 days.
- `page_watch_state` retained indefinitely (small cardinality = URL count).

## Validation rules

- URLs normalized (trim, consistent scheme) before upsert to `page_watch_state`.
- At most one email batch per `check_runs` row when `urls_alerted > 0`.
- `notified_while_present` MUST reset to `false` when `keyword_present` becomes `false`.
