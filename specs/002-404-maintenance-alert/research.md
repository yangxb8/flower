# Research: Maintenance 404 Alert

**Feature**: `002-404-maintenance-alert`  
**Date**: 2026-06-05

## R1: Integration surface

| | |
|---|---|
| **Decision** | Extend existing `monitor-check` Edge Function and PostgreSQL schema from feature `001`; no second function or schedule |
| **Rationale** | Spec FR-001 requires same URL list and schedule; single cron invoke keeps cost and ops simple |
| **Alternatives considered** | Separate `monitor-maintenance` function (duplicate fetch, two cron jobs); external watcher service (rejected — stack stays Supabase-only) |

## R2: HTTP 404 detection

| | |
|---|---|
| **Decision** | Capture raw `response.status` in `fetch-page.ts`; treat **exactly 404** as maintenance signal; **2xx** as recovery + inventory parse path; all other outcomes as `fetch_error` without maintenance dedup changes |
| **Rationale** | Spec limits v1 to 404-only; current code collapses all `!response.ok` into generic errors — must branch on status |
| **Alternatives considered** | Treat 403/410 as maintenance (rejected — out of scope); parse 404 HTML body for keywords (rejected — FR-011 forbids inventory path on 404) |

## R3: Maintenance deduplication

| | |
|---|---|
| **Decision** | **Disappear → reappear** gate per URL for 404 episodes, mirroring inventory dedup in `dedup.ts`. Persist `maintenance_404_present` + `notified_while_404` on `page_watch_state`. Email only when URL newly enters 404 after not being in 404 (or after prior 2xx recovery). |
| **Rationale** | User explicitly requested same anti-spam pattern as inventory: no spam while still 404; notify again after back → 404 |
| **Alternatives considered** | Time-based cooldown (rejected — user asked episode-based); global daily cap (rejected — per-URL episode is clearer) |

## R4: Recovery definition

| | |
|---|---|
| **Decision** | Maintenance episode ends only on **HTTP 2xx** successful fetch for that URL |
| **Rationale** | Matches spec assumption; avoids resetting episode on transient 503/timeouts |
| **Alternatives considered** | Any non-404 ends episode (rejected — flaky during outages); manual reset UI (rejected — out of scope) |

## R5: Email delivery

| | |
|---|---|
| **Decision** | Second Resend message per run when maintenance matches exist: subject prefix `[メンテナンス]` / English framing “may open for sale soon”; same `ALERT_EMAIL` and `RESEND_*` secrets; same retry policy as inventory email |
| **Rationale** | Spec FR-004/FR-008 require distinct, batched maintenance email; reuses proven Resend path |
| **Alternatives considered** | Single combined email mixing inventory + maintenance (rejected — spec allows two emails and distinct framing); separate recipient env (deferred) |

## R6: Schema evolution

| | |
|---|---|
| **Decision** | Additive migration: extend `page_watch_state`, `check_runs`, `check_run_results`; no new tables |
| **Rationale** | Small cardinality (≤10 URLs); keeps joins simple; maintenance and inventory state per URL stay aligned |
| **Alternatives considered** | `maintenance_watch_state` table (valid but extra join for little benefit at this scale) |

## R7: Run logging

| | |
|---|---|
| **Decision** | Extend `check_run_results` with `http_status`, `maintenance_detected`, `maintenance_eligible`, `maintenance_sent`, `maintenance_skip_reason`; extend `check_runs` with `maintenance_urls_alerted` and `maintenance_email_status` |
| **Rationale** | FR-010 observability; mirrors existing inventory columns; supports debugging without new log store |
| **Alternatives considered** | JSON blob column (harder to query); external logging only (insufficient for FR-010) |

## R8: Dual-email same run

| | |
|---|---|
| **Decision** | Inventory and maintenance batches are independent within one `check_runs` row; send maintenance email first or inventory first (order irrelevant); at most one maintenance + one inventory email per run |
| **Rationale** | Spec edge case: different URLs may qualify for each type in same cycle; FR-011 prevents same URL from both paths when status is 404 |
| **Alternatives considered** | Merge into one email with sections (rejected — spec requires distinguishable notifications) |
