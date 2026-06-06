# Feature Specification: Maintenance 404 Alert

**Feature Branch**: `002-404-maintenance-alert`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "If a page returns 404 error, it means it's taken down for maintenance. This usually means they will open for sell soon. When you see 404 also send a different email to inform that the product will be available soon. Don't spam when you see 404 everytime; if a page went 404, back, then 404 again, you can send next notification."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive maintenance alert when a page goes unavailable (Priority: P1)

As a monitor operator watching product pages, when a monitored page returns **HTTP 404**, I receive a **distinct maintenance notification email** indicating the product may become available for sale soon. This is separate from the existing inventory-keyword alert. Each notification includes the affected page URL so I know which product is in a maintenance window.

**Why this priority**: A 404 on these shop pages is an early signal that a listing is being prepared for sale; timely notice lets the operator act before stock appears.

**Independent Test**: Configure one monitored URL that returns 404; run one check cycle; verify one maintenance email (not an inventory alert) with that URL.

**Acceptance Scenarios**:

1. **Given** a monitored URL that previously returned a normal page, **When** the next check receives HTTP 404 for that URL, **Then** the operator receives a maintenance notification email for that URL.
2. **Given** multiple monitored URLs where two return HTTP 404 in the same check cycle, **When** both are newly in a maintenance episode, **Then** the operator receives one maintenance email listing both URLs (batched for that run).
3. **Given** a maintenance notification is sent for a URL, **When** the operator reads the email, **Then** it is clearly distinguishable from inventory availability alerts (different subject or body framing indicating maintenance / coming soon).

---

### User Story 2 - Avoid repeat maintenance spam while still down (Priority: P2)

As a monitor operator, I do not receive a new maintenance email on every check while a page **stays** on HTTP 404. I am notified once per maintenance episode until the page becomes available again.

**Why this priority**: Frequent polling would otherwise flood the operator when a page remains in maintenance for hours or days.

**Independent Test**: Run ten consecutive checks against a URL that continuously returns 404 after the first alert; verify only one maintenance email is sent.

**Acceptance Scenarios**:

1. **Given** a URL already in HTTP 404 and a maintenance alert was sent for the current episode, **When** subsequent checks still receive HTTP 404, **Then** no additional maintenance emails are sent for that URL.
2. **Given** a check run where some URLs are still in an ongoing 404 episode and others are newly entering 404, **When** the run completes, **Then** only URLs newly entering 404 (or re-entering after recovery) are included in the maintenance email.

---

### User Story 3 - Notify again after recovery and re-maintenance (Priority: P3)

As a monitor operator, when a page **recovers** from 404 (returns a normal response) and later returns **404 again**, I receive a **new** maintenance notification. This mirrors the “disappear → reappear” pattern used for inventory alerts.

**Why this priority**: Each new maintenance cycle may precede a new sale window; the operator needs a fresh signal without manual reset.

**Independent Test**: Simulate URL sequence: 404 → 200 (or other non-404 success) → 404; verify two maintenance emails over time, not one.

**Acceptance Scenarios**:

1. **Given** a URL that was in 404 and already notified, **When** a later check receives a normal (non-404) response, **Then** the system treats the maintenance episode as ended for that URL.
2. **Given** a URL whose maintenance episode has ended, **When** a subsequent check receives HTTP 404 again, **Then** the operator receives a new maintenance notification for that URL.

---

### Edge Cases

- What happens when a URL returns HTTP errors other than 404 (e.g., 500, 503, timeout)? No maintenance alert; failure is recorded in run logs; other URLs continue to be checked. (503 temporary outage is not treated as “maintenance listing” unless operator later expands scope.)
- What happens when a URL permanently returns 404 (product removed)? Operator receives one notification per maintenance episode; no repeated spam while it stays 404; no automatic “product deleted” interpretation beyond maintenance framing.
- What happens when the same run has both a new 404 maintenance match and a new inventory keyword match on different URLs? Operator may receive up to two emails in that run—one maintenance batch and one inventory batch—each with appropriate content.
- What happens when maintenance email delivery fails? Retry with backoff; persistent failure is logged; notification state for that URL is not advanced until delivery succeeds (so a retry can send on a later run).
- What happens when a monitored URL is disabled in the page list? It is skipped; no maintenance or inventory processing for that URL.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST evaluate HTTP response status for each enabled monitored URL on every scheduled check (same URL list and schedule as the existing website monitor).
- **FR-002**: System MUST treat **HTTP 404** as a maintenance-unavailable signal for that URL (interpreted as listing taken down for maintenance and potentially opening for sale soon).
- **FR-003**: System MUST send a **maintenance notification email** to the configured operator recipient when at least one URL newly enters a 404 maintenance episode in a check run.
- **FR-004**: Each maintenance notification MUST be clearly distinct from inventory-keyword alerts (e.g., different subject line and body wording focused on maintenance / coming soon).
- **FR-005**: Each maintenance notification MUST include every newly eligible URL from that run, with the page URL for each entry.
- **FR-006**: System MUST suppress repeat maintenance notifications for a URL while it remains in HTTP 404 after the operator has been notified for the current episode.
- **FR-007**: System MUST end a URL’s maintenance episode when a check receives a **non-404 successful response** (e.g., HTTP 2xx) for that URL, allowing a future 404 to trigger a new notification.
- **FR-008**: System MUST batch all newly eligible maintenance URLs from a single check run into one maintenance email.
- **FR-009**: System MUST continue checking remaining URLs when one URL fails to fetch or returns a non-404 error.
- **FR-010**: System MUST record per-URL maintenance check outcomes (404 detected, episode state, notification sent or suppressed, fetch error) in run logs retained for at least 30 days.
- **FR-011**: System MUST NOT send a maintenance notification and an inventory-keyword notification for the **same URL in the same check run** when the URL returns HTTP 404 (404 takes precedence; no keyword parsing on error responses).

### Key Entities

- **Monitored page**: Same URL entries managed by the operator in the existing page list; enabled/disabled per row.
- **Maintenance episode**: Per-URL period beginning when HTTP 404 is first observed after the page was not in 404, ending when a non-404 successful response is observed.
- **Maintenance watch state**: Per-URL memory of whether the page is currently in 404, and whether the operator has been notified for the current episode.
- **Maintenance notification**: Email distinct from inventory alerts; lists URLs newly entering maintenance in that run.
- **Check run**: One scheduled execution; may produce zero, one, or two email types (maintenance and/or inventory) depending on URL outcomes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a monitored URL transitions to HTTP 404, the operator receives a maintenance notification within one check cycle, with the correct URL listed.
- **SC-002**: When a URL stays on HTTP 404 across 10 consecutive check cycles after the first alert, the operator receives **zero** additional maintenance emails for that URL.
- **SC-003**: When a URL follows 404 → recovered → 404 again, the operator receives **exactly two** maintenance emails (one per episode) across the sequence.
- **SC-004**: In review, operators can tell maintenance emails apart from inventory emails without opening the target site in 100% of test scenarios (distinct subject or header wording).
- **SC-005**: A fetch or non-404 error on one URL does not prevent other monitored URLs from being evaluated in the same run.
- **SC-006**: At least 95% of check runs complete maintenance and inventory evaluation for all reachable URLs within 60 seconds under normal load (up to 10 URLs).

## Assumptions

- This feature extends the **existing website keyword monitor** for the same operator, URL list, schedule, and notification recipient.
- **Only HTTP 404** triggers maintenance alerts; other status codes and network failures are logged but do not use the maintenance email path.
- “Back” / recovery means the page returns a normal successful response (HTTP 2xx), not merely a different error code.
- Maintenance emails use the same operator recipient as inventory alerts unless a separate recipient is added in a future feature.
- Target shop behavior: 404 on product pages commonly indicates temporary maintenance before sale, per operator domain knowledge.
- Legal/compliance responsibility for accessing target sites remains with the operator.

## Dependencies

- Existing website keyword monitor (feature `001-website-keyword-monitor`) must be deployed with monitored URLs, scheduled checks, and email delivery already configured.

## Out of Scope

- Treating HTTP 503, 502, or network timeouts as maintenance signals (v1 is 404-only).
- Custom admin UI for maintenance rules or per-URL maintenance templates.
- Automatic prediction of exact on-sale time or calendar reminders.
- Multi-recipient routing or SMS/push channels for maintenance alerts.
- Distinguishing “permanent product removal” from “temporary maintenance” beyond the 404 episode dedup behavior.
