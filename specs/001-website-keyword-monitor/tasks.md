---
description: "Task list for Website Keyword Monitor (Supabase Edge Function)"
---

# Tasks: Website Keyword Monitor

**Input**: Design documents from `/specs/001-website-keyword-monitor/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not requested in spec — unit tests for parser/dedup are optional in Polish phase only.

**Organization**: Tasks grouped by user story (US1 = P1 alerts, US2 = P2 dedup). US2 implementation uses **disappear→reappear** per plan.md (not `<h4>` text diff).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2 for user-story phases only

## Path Conventions

- Supabase: `supabase/` at repository root
- Edge Function: `supabase/functions/monitor-check/`
- Migrations: `supabase/migrations/`
- Optional tests: `tests/monitor-check/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize Supabase project layout and Edge Function scaffold

- [ ] T001 Run `supabase init` and create `supabase/config.toml` with project settings
- [ ] T002 Create Edge Function scaffold at `supabase/functions/monitor-check/` with `deno.json` (or import map) for `@supabase/supabase-js` and `npm:linkedom`
- [ ] T003 [P] Add `supabase/.env.example` documenting `ALERT_EMAIL`, `RESEND_API_KEY`, `RESEND_FROM`, `MONITOR_CRON_SECRET`, `FETCH_TIMEOUT_MS` (URLs come from DB, not env) per `specs/001-website-keyword-monitor/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema and shared modules — **must complete before US1/US2**

**⚠️ CRITICAL**: No user story work until this phase is complete

- [ ] T004 Create migration `supabase/migrations/20260604000000_monitor_schema.sql` with tables `monitored_pages`, `page_watch_state`, `check_runs`, `check_run_results` and **seed** two OFG URLs (`?pid=176762784`, `?pid=165901954`) per `specs/001-website-keyword-monitor/data-model.md`
- [ ] T005 [P] Implement Supabase client helpers in `supabase/functions/monitor-check/db.ts` (load enabled `monitored_pages`, create run, insert results, complete run, upsert watch state)
- [ ] T006 [P] Implement env validation in `supabase/functions/monitor-check/config.ts` (required secrets, default `FETCH_TIMEOUT_MS`; no `MONITOR_URLS`)
- [ ] T007 Implement `x-monitor-secret` verification in `supabase/functions/monitor-check/auth.ts` per `specs/001-website-keyword-monitor/contracts/monitor-check.openapi.yaml`
- [ ] T008 Apply migration locally with `supabase db reset` or `supabase migration up` and verify four tables exist plus two seed rows in `monitored_pages`

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 - Receive alert when 在庫数 appears (Priority: P1) 🎯 MVP

**Goal**: Scheduled/manual check fetches URLs, detects **在庫数**, extracts `div.flr > h4` text, sends one batched **Resend** email for all newly matching URLs in the run (first-time presence counts as match).

**Independent Test**: Deploy with one URL containing 在庫数; `POST /functions/v1/monitor-check` with valid secret; receive email with URL + `<h4>` text; `check_run_results` shows `alert_sent: true`.

### Implementation for User Story 1

- [ ] T009 [P] [US1] Implement HTTP fetch with timeout in `supabase/functions/monitor-check/fetch-page.ts`
- [ ] T010 [P] [US1] Implement keyword + DOM extraction in `supabase/functions/monitor-check/parse-inventory.ts` (在庫数 substring, `div.flr h4` text, multiple `h4` joined/labeled)
- [ ] T011 [P] [US1] Implement Resend batch send with HTML/plain templates in `supabase/functions/monitor-check/email.ts` per `specs/001-website-keyword-monitor/contracts/resend-send.md` and `alert-email.schema.json`
- [ ] T012 [US1] Implement `supabase/functions/monitor-check/pages.ts` to load enabled URLs from `monitored_pages` and orchestration in `index.ts`: secret check, insert `check_runs`, loop DB URLs, fetch→parse, log `check_run_results`, batch email when any URL has keyword+structure (dedup stub: treat all present matches as eligible)
- [ ] T013 [US1] Return JSON response matching `specs/001-website-keyword-monitor/contracts/monitor-check.openapi.yaml` (`run_id`, `results[]`, `email_status`)
- [ ] T014 [US1] Support `dry_run` request body flag (evaluate and log, no Resend call, no `notified_while_present` updates)
- [ ] T015 [US1] Handle edge cases in `index.ts`: fetch error continues other URLs (FR-010); missing `div.flr`/`h4` → no alert, `structure_ok: false` (FR/spec edge cases)

**Checkpoint**: MVP — operator gets correct first alert email for matching pages

---

## Phase 4: User Story 2 - Avoid duplicate noise (Priority: P2)

**Goal**: No repeat emails while 在庫数 stays present; new email only after keyword **disappears then reappears** on a URL (plan/research; supersedes spec `<h4>` diff for v1).

**Independent Test**: Two consecutive checks with unchanged presence → one email only; after keyword absent on page then present again → second email.

### Implementation for User Story 2

- [ ] T016 [P] [US2] Implement disappear→reappear state machine in `supabase/functions/monitor-check/dedup.ts` per `specs/001-website-keyword-monitor/data-model.md`
- [ ] T017 [US2] Integrate `dedup.ts` into `supabase/functions/monitor-check/index.ts`: load/upsert `page_watch_state`, set `alert_eligible` and `skip_reason` (`already_notified`, `keyword_absent`, etc.)
- [ ] T018 [US2] Set `notified_while_present` and `keyword_present` in `page_watch_state` only after successful Resend send (rollback eligibility if email fails)
- [ ] T019 [US2] Reset `notified_while_present` when `keyword_present` transitions to false (在庫数 disappeared)
- [ ] T020 [US2] Add Resend retry logic (3 attempts, 1s/2s/4s backoff) in `supabase/functions/monitor-check/email.ts` for 429/5xx; set `check_runs.email_status` to `failed` on exhaustion

**Checkpoint**: US1 + US2 — no spam while keyword remains; re-alert after disappear→reappear

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Scheduling, retention, deploy docs, optional tests

- [ ] T021 [P] Add cron schedule documentation or SQL in `supabase/migrations/` for hourly invoke via Dashboard/`pg_cron` per `specs/001-website-keyword-monitor/quickstart.md`
- [ ] T022 [P] Add retention cleanup SQL or migration comment for purging `check_runs`/`check_run_results` older than 30 days
- [ ] T023 Deploy `monitor-check` with `supabase functions deploy monitor-check --no-verify-jwt` and set secrets via `supabase secrets set`
- [ ] T024 Run end-to-end validation following `specs/001-website-keyword-monitor/quickstart.md` (dry_run, live send, dedup scenario)
- [ ] T025 [P] Optional: add Deno unit tests in `tests/monitor-check/parse-inventory.test.ts` and `tests/monitor-check/dedup.test.ts` per plan.md

---

## Dependencies & Execution Order

### Phase Dependencies

| Phase | Depends on | Blocks |
|-------|------------|--------|
| 1 Setup | — | Phase 2 |
| 2 Foundational | Phase 1 | Phase 3, 4 |
| 3 US1 (P1) | Phase 2 | MVP deploy |
| 4 US2 (P2) | Phase 3 (index.ts exists) | Full dedup |
| 5 Polish | Phase 4 (recommended) | Production-ready |

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2
- **US2 (P2)**: After US1 — extends `index.ts` and `email.ts`; independently testable via DB state + two/manual invocations

### Within Each User Story

- Parser/fetch/email modules [P] before `index.ts` integration
- US2 `dedup.ts` before `index.ts` integration updates

### Parallel Opportunities

**Phase 1**: T003 parallel with T001–T002 after T001 starts  
**Phase 2**: T005 ∥ T006 ∥ T007 after T004  
**Phase 3**: T009 ∥ T010 ∥ T011, then T012–T015 sequential  
**Phase 4**: T016 parallel with T020 prep; T017–T019 sequential  
**Phase 5**: T021 ∥ T022 ∥ T025; T023–T024 sequential

---

## Parallel Example: User Story 1

```bash
# Parallel module work:
# T009 fetch-page.ts
# T010 parse-inventory.ts
# T011 email.ts

# Then integrate:
# T012 index.ts orchestration
```

---

## Parallel Example: User Story 2

```bash
# T016 dedup.ts (standalone)

# Then:
# T017–T019 index.ts + email.ts integration
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 + Phase 2  
2. Complete Phase 3 (T009–T015)  
3. **STOP and VALIDATE**: manual `curl` + Resend inbox + `check_run_results` rows  
4. Deploy/demo

### Incremental Delivery

1. Foundation → US1 (alerts work, may re-notify each run until US2)  
2. Add US2 (dedup) → validate disappear→reappear  
3. Polish → cron + retention + production secrets

### Suggested MVP Scope

**User Story 1 only** (Phase 1–3, tasks T001–T015) delivers core value: detect 在庫数 and email URL + `h4` text. Add **US2** (T016–T020) before production to prevent spam.

---

## Notes

- Keyword constant: `在庫数` only  
- Email provider: **Resend** only (`RESEND_API_KEY`, `RESEND_FROM`)  
- Monitored URLs: `monitored_pages` table (Supabase Table Editor); initial OFG `pid=176762784`, `pid=165901954`  
- Email/schedule: deploy secrets — no custom admin UI  
- Total tasks: **25** (T001–T025)  
- Per story: Setup 3, Foundational 5, US1 7, US2 5, Polish 5
