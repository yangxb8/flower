# Feature Specification: Website Keyword Monitor

**Feature Branch**: `001-website-keyword-monitor`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Create a bot that can periodically pull multiple websites and scan for keyword, if the keyword exist in page(s), send email with extracted text from the website"

## Clarifications

### Session 2026-06-04

- Q: Is runtime monitor configuration (add/edit/pause URLs and keywords without redeploy) required? → A: No — operator changes the list of monitored websites by redeploying; no in-app configuration UI.
- Q: Which keyword(s) must be detected on each page? → A: Only **在庫数** (inventory count label) on any given monitored page.
- Q: What must each alert email contain when a match occurs? → A: The page URL and the text content of the `<h4>` element inside `<div class="flr">` on that page (not generic body excerpts around the keyword).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive alert when 在庫数 appears (Priority: P1)

As a monitor operator, I deploy the bot with a fixed list of website URLs and a notification email address. On each scheduled check, the system fetches each URL, searches the page for the keyword **在庫数**, and when it is present sends me an email. Each email entry includes that page’s URL and the text from the `<h4>` inside `<div class="flr">` on that page.

**Why this priority**: This is the core value—knowing when inventory-related content appears on watched pages, with the specific stock heading text the operator cares about.

**Independent Test**: Deploy with one URL known to contain 在庫数 and a valid recipient; run one check cycle; verify one email with correct URL and `<div class="flr">` / `<h4>` text.

**Acceptance Scenarios**:

1. **Given** a deployment with one URL and recipient email, **When** the scheduled check runs and the page contains 在庫数, **Then** the operator receives an email listing that URL and the text of the `<h4>` inside `<div class="flr">` on that page.
2. **Given** a deployment with multiple URLs, **When** only one page contains 在庫数, **Then** the email includes only the matching URL and its corresponding `<h4>` text—not entries for non-matching URLs.
3. **Given** a page that contains 在庫数 but has no `<div class="flr">` or no `<h4>` within it, **When** the check runs, **Then** no alert is sent for that URL (or the run is logged as incomplete extraction per edge-case rules); the operator is not sent misleading excerpt text.

---

### User Story 2 - Avoid duplicate noise (Priority: P2)

As a monitor operator, I do not receive repeated emails for the same unchanged match on the same page. If the `<h4>` text inside `<div class="flr">` changes materially, I receive a new alert.

**Why this priority**: Periodic polling would otherwise spam the operator when 在庫数 remains on a static page with unchanged stock heading text.

**Independent Test**: Run two consecutive checks against a static page with a permanent 在庫数 match and unchanged `<h4>` text; verify only the first check triggers email.

**Acceptance Scenarios**:

1. **Given** a page that already triggered an alert for 在庫数 with unchanged `<h4>` text in `<div class="flr">`, **When** the next scheduled check runs, **Then** no duplicate email is sent for that URL.
2. **Given** a page that previously matched, **When** the `<h4>` text inside `<div class="flr">` changes materially, **Then** a new alert email is sent with the updated URL and `<h4>` text.

---

### Edge Cases

- What happens when a URL is unreachable (timeout, DNS failure, HTTP error)? No false-positive keyword alert; failure is recorded in run logs; other URLs in the same deployment continue on schedule.
- What happens when the page contains 在庫数 but `<div class="flr">` or its `<h4>` is missing? No email for that URL; the run logs note missing target structure.
- What happens when `<div class="flr">` contains multiple `<h4>` elements? The email includes text from all matching `<h4>` elements within that div, clearly labeled if more than one.
- What happens when 在庫数 appears outside `<div class="flr">` but not inside the `<h4>`? No alert (keyword alone is insufficient; extraction target is the specified `<h4>` within `<div class="flr">`).
- What happens when email delivery fails? Retry up to 3 times with backoff; persistent failure is logged.
- What happens when multiple URLs match in one run? One email per scheduled run batches all matches, grouped by URL.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST read the list of target URLs, check schedule, and notification recipient(s) from deployment configuration (changed only by redeploy, not at runtime).
- **FR-002**: System MUST fetch each configured URL on the deployment schedule.
- **FR-003**: System MUST treat a page as a match only when the literal keyword **在庫数** appears in the fetched page content.
- **FR-004**: For each matching URL, system MUST locate `<div class="flr">` and extract the text content of its `<h4>` element(s).
- **FR-005**: System MUST send an email to configured recipient(s) when at least one URL matches in a check run.
- **FR-006**: Each alert email MUST include, for every matching URL: the page URL and the extracted `<h4>` text from `<div class="flr">` on that page.
- **FR-007**: System MUST NOT provide runtime UI or APIs to add, edit, pause, or remove monitors; URL list changes require redeploy.
- **FR-008**: System MUST suppress repeat alert emails for the same URL when 在庫数 is still present and the extracted `<h4>` text is substantively unchanged across consecutive successful checks.
- **FR-009**: System MUST batch all new matches from a single check run into one email when multiple URLs match in that run.
- **FR-010**: System MUST continue checking remaining URLs when one URL fails to fetch.
- **FR-011**: System MUST record the outcome of each check run (success, fetch failure, match found, no match, missing structure, email sent, email failed) in logs retained for at least 30 days.

### Key Entities

- **Deployment configuration**: Fixed at deploy time; includes target URL list, check schedule, and notification recipient email address(es).
- **Check run**: One scheduled execution; per-URL status, whether 在庫数 was found, extracted `<h4>` text, and email delivery status.
- **Match result**: 在庫数 found on a URL with extractable `<h4>` inside `<div class="flr">`; includes URL, extracted heading text, and whether notification is new vs duplicate-suppressed.
- **Alert email**: One message per check run with new matches; body sections per URL (URL + `<h4>` text).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After deploy with at least one URL containing 在庫数, the operator receives a correct alert email (URL + `<h4>` text from `<div class="flr">`) within one check cycle.
- **SC-002**: At least 95% of check runs complete for all reachable URLs within 60 seconds of the scheduled start time under normal load (up to 10 URLs per deployment).
- **SC-003**: When page content is unchanged (在庫数 present, same `<h4>` text), the operator receives zero duplicate alert emails across 10 consecutive check cycles.
- **SC-004**: In review, operators can identify stock status from the email alone without opening the site in 90% of test scenarios (target: operator, 10 representative pages).
- **SC-005**: Fetch failure for one URL does not prevent other configured URLs from being checked in the same run.

## Assumptions

- Target pages use a consistent layout with inventory information in `<div class="flr">` and the relevant value or label in a child `<h4>`; pages without this structure are not supported for alerting.
- The sole search keyword is **在庫数**; no other keywords or per-URL keyword overrides.
- Monitored URLs and schedule are updated by redeploying the bot, not through an operator console.
- Target pages are publicly reachable over HTTP or HTTPS without login for version 1.
- Default check interval is hourly unless specified in deployment configuration.
- Email delivery uses a single outbound mailbox or service account configured at deploy time.
- Legal/compliance responsibility for accessing target sites rests with the operator.

## Out of Scope

- Runtime monitor management (add, edit, pause, remove URLs or keywords without redeploy).
- Configurable keyword lists, case-sensitivity toggles, or whole-word matching options.
- Generic “surrounding text” excerpts around keyword matches (replaced by structured `<h4>` extraction).
- Multi-tenant operator accounts and role-based access control.
