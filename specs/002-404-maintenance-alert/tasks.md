---
description: "Task list for Maintenance 404 Alert (extends monitor-check Edge Function)"
---

# Tasks: Maintenance 404 Alert

**Input**: Design documents from `/specs/002-404-maintenance-alert/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md  
**Depends on**: Feature `001-website-keyword-monitor` deployed (`supabase/functions/monitor-check/`)

**Tests**: Not requested in spec — unit tests for `dedup-maintenance.ts` in Polish phase per plan.md.

**Organization**: Tasks grouped by user story (US1 = P1 maintenance alert, US2 = P2 anti-spam, US3 = P3 recovery re-alert).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3 for user-story phases only

## Path Conventions

- Supabase: `supabase/` at repository root
- Edge Function: `supabase/functions/monitor-check/`
- Migrations: `supabase/migrations/`
- Tests: `tests/monitor-check/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm 001 baseline and feature branch readiness

- [x] T001 Verify `supabase/functions/monitor-check/` exists with 001 implementation (`index.ts`, `fetch-page.ts`, `dedup.ts`, `email.ts`, `db.ts`) on branch `002-404-maintenance-alert`
- [x] T002 [P] Review `specs/002-404-maintenance-alert/plan.md`, `data-model.md`, and `contracts/monitor-check.openapi.yaml` v1.1 before coding

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, HTTP status capture, shared types and DB helpers — **must complete before US1–US3**

**⚠️ CRITICAL**: No user story work until this phase is complete

- [x] T003 Create additive migration `supabase/migrations/20260605000000_maintenance_404_schema.sql` per `specs/002-404-maintenance-alert/data-model.md` (`page_watch_state`, `check_runs`, `check_run_results` columns)
- [x] T004 [P] Extend maintenance and result interfaces in `supabase/functions/monitor-check/types.ts` (`MaintenanceWatchState`, `MaintenanceDedupInput/Output`, extended `UrlCheckResult`, `MaintenanceMatch`)
- [x] T005 [P] Update `supabase/functions/monitor-check/fetch-page.ts` to return `status: number | null`; `ok: true` only for 2xx; `status: 404` with `body: null` (no decode); other errors retain status in `error`
- [x] T006 [P] Extend `supabase/functions/monitor-check/db.ts`: load/upsert `maintenance_404_present` and `notified_while_404`; insert extended `check_run_results`; `completeCheckRun` with `maintenance_urls_alerted` and `maintenance_email_status`
- [x] T007 Apply migration with `supabase db push` (or `supabase db reset` locally) and verify new columns on three tables
- [x] T008 Update inventory-only callers in `supabase/functions/monitor-check/index.ts` to compile against new `FetchOutcome` shape (no behavior change yet)

**Checkpoint**: Foundation ready — maintenance columns exist; fetch returns HTTP status

---

## Phase 3: User Story 1 - Receive maintenance alert when a page goes unavailable (Priority: P1) 🎯 MVP

**Goal**: HTTP 404 on a monitored URL triggers a **distinct** maintenance email (batched per run) with page URL(s); no inventory parse on 404.

**Independent Test**: Point one URL at a 404 response; `POST /functions/v1/monitor-check` with valid secret; receive `[メンテナンス]` email; `check_run_results` shows `maintenance_detected: true`, `maintenance_sent: true`.

### Implementation for User Story 1

- [x] T009 [P] [US1] Implement `sendMaintenanceEmail` in `supabase/functions/monitor-check/email.ts` per `specs/002-404-maintenance-alert/contracts/maintenance-email.schema.json` (subject `[メンテナンス]`, URL list, HTML + plain text, same Resend retry policy as inventory)
- [x] T010 [P] [US1] Create `supabase/functions/monitor-check/dedup-maintenance.ts` with `evaluateMaintenanceDedup` — eligible when URL newly enters 404 (stub: treat first 404 as eligible; full suppress/recovery in US2/US3)
- [x] T011 [US1] Add 404 branch in `supabase/functions/monitor-check/index.ts`: maintenance dedup only, skip `parse-inventory.ts`, set `maintenance_detected: true`, inventory fields false
- [x] T012 [US1] Batch maintenance-eligible URLs and send maintenance email in `index.ts`; update `check_runs.maintenance_email_status` and `maintenance_urls_alerted`
- [x] T013 [US1] Extend JSON response in `index.ts` per `specs/002-404-maintenance-alert/contracts/monitor-check.openapi.yaml` (`maintenance_urls_alerted`, `maintenance_email_status`, per-result maintenance fields)
- [x] T014 [US1] Support `dry_run` for maintenance path in `index.ts` (evaluate and log, no Resend call, no `notified_while_404` advance)

**Checkpoint**: MVP — operator gets maintenance email when a URL first returns 404

---

## Phase 4: User Story 2 - Avoid repeat maintenance spam while still down (Priority: P2)

**Goal**: No repeat maintenance emails while a URL **stays** on HTTP 404 after the first notification for the current episode.

**Independent Test**: Ten consecutive checks with continuous 404 after first alert → one maintenance email only; `maintenance_skip_reason: already_notified` on subsequent runs.

### Implementation for User Story 2

- [x] T015 [P] [US2] Complete `already_notified` branch in `supabase/functions/monitor-check/dedup-maintenance.ts` when `maintenance_404_present && notified_while_404`
- [x] T016 [US2] Integrate full maintenance dedup into `index.ts`: set `maintenance_eligible`, `maintenance_skip_reason`; upsert `page_watch_state` maintenance columns on non-send paths
- [x] T017 [US2] Set `notified_while_404` and `maintenance_404_present` in `page_watch_state` only after successful maintenance Resend send in `index.ts` (retry eligibility if email fails)
- [x] T018 [US2] On non-404 fetch errors (timeout, 5xx) in `index.ts`, preserve existing maintenance watch state (do not end or advance episode)

**Checkpoint**: US1 + US2 — no spam while page remains 404

---

## Phase 5: User Story 3 - Notify again after recovery and re-maintenance (Priority: P3)

**Goal**: HTTP 2xx ends the maintenance episode; a later 404 triggers a **new** maintenance notification.

**Independent Test**: Sequence 404 → 200 → 404 produces two maintenance emails; `page_watch_state` shows episode reset after 2xx.

### Implementation for User Story 3

- [x] T019 [P] [US3] Implement recovery reset in `supabase/functions/monitor-check/dedup-maintenance.ts` when `now404=false` (2xx): `maintenance_404_present=false`, `notified_while_404=false`
- [x] T020 [US3] Wire 2xx success path in `index.ts`: run inventory parse/dedup as today **and** apply maintenance recovery reset via `dedup-maintenance.ts`
- [x] T021 [US3] Enforce FR-011 in `index.ts`: when `http_status === 404`, same URL MUST NOT have `alert_eligible: true` in the same result row
- [x] T022 [US3] Support dual-email same run in `index.ts`: independent maintenance and inventory batches when different URLs qualify (at most one email per type per run)

**Checkpoint**: Full 404 episode lifecycle — enter, suppress, recover, re-enter

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Tests, docs, deploy, end-to-end validation

- [x] T023 [P] Add Deno unit tests in `tests/monitor-check/dedup-maintenance.test.ts` (new 404, already_notified, recovery, re-enter 404)
- [x] T024 [P] Update `supabase/README.md` with maintenance 404 behavior and link to `specs/002-404-maintenance-alert/quickstart.md`
- [x] T025 Deploy updated `monitor-check` with `supabase functions deploy monitor-check --no-verify-jwt` (or MCP deploy) — no new secrets
- [x] T026 Run end-to-end validation per `specs/002-404-maintenance-alert/quickstart.md` (dry_run 404 fields, live maintenance send, dedup + recovery scenario)
- [x] T027 [P] Verify `check_run_results` and `page_watch_state` maintenance columns populated correctly via SQL queries in quickstart

---

## Dependencies & Execution Order

### Phase Dependencies

| Phase | Depends on | Blocks |
|-------|------------|--------|
| 1 Setup | — | Phase 2 |
| 2 Foundational | Phase 1, 001 deployed | Phase 3, 4, 5 |
| 3 US1 (P1) | Phase 2 | MVP deploy |
| 4 US2 (P2) | Phase 3 (`index.ts` 404 path) | Anti-spam production |
| 5 US3 (P3) | Phase 4 (`dedup-maintenance.ts`) | Full episode lifecycle |
| 6 Polish | Phase 5 (recommended) | Production-ready |

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2/US3
- **US2 (P2)**: After US1 — extends `dedup-maintenance.ts` and `index.ts`; testable via repeated 404 invocations
- **US3 (P3)**: After US2 — extends recovery on 2xx path; testable via 404→2xx→404 sequence

### Within Each User Story

- `email.ts` / `dedup-maintenance.ts` [P] before `index.ts` integration
- US2/US3 both touch `dedup-maintenance.ts` — US2 before US3

### Parallel Opportunities

**Phase 1**: T002 ∥ T001  
**Phase 2**: T004 ∥ T005 ∥ T006 after T003; T007 after T003  
**Phase 3**: T009 ∥ T010, then T011–T014 sequential  
**Phase 4**: T015 parallel; T016–T018 sequential  
**Phase 5**: T019 parallel; T020–T022 sequential  
**Phase 6**: T023 ∥ T024 ∥ T027; T025–T026 sequential

---

## Parallel Example: User Story 1

```bash
# Parallel module work:
# T009 email.ts — sendMaintenanceEmail
# T010 dedup-maintenance.ts — initial eligible logic

# Then integrate:
# T011–T014 index.ts orchestration + response
```

---

## Parallel Example: User Story 2 + 3

```bash
# T015 dedup-maintenance.ts — already_notified (US2)
# T019 dedup-maintenance.ts — recovery reset (US3) — after US2 merge

# Then index.ts integration tasks per phase
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 + Phase 2  
2. Complete Phase 3 (T009–T014)  
3. **STOP and VALIDATE**: `curl` dry_run + live maintenance email on 404 URL  
4. Deploy/demo

### Incremental Delivery

1. Foundation → US1 (maintenance alert works; may re-notify each run until US2)  
2. Add US2 (suppress while 404) → validate 10 consecutive 404 checks  
3. Add US3 (recovery re-alert) → validate 404→2xx→404  
4. Polish → deploy + unit tests

### Suggested MVP Scope

**User Story 1 only** (Phase 1–3, tasks T001–T014) delivers core value: detect HTTP 404 and send distinct maintenance email. Add **US2** (T015–T018) before production to prevent spam. Add **US3** (T019–T022) for full episode lifecycle.

---

## Notes

- HTTP **404 only** for maintenance (v1); other errors logged as `fetch_error`  
- Maintenance email distinct from `[在庫数]` inventory email; same `ALERT_EMAIL` recipient  
- Dedup: disappear→reappear for 404 episodes (mirror inventory `dedup.ts` pattern)  
- No new env vars or cron schedule  
- Total tasks: **27** (T001–T027)  
- Per phase: Setup 2, Foundational 6, US1 6, US2 4, US3 4, Polish 5
