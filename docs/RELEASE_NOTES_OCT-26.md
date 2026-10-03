# Release notes and smoke-test plan — 2026-09-30

Scope:
`0824dc6f0ad8ae33e98f8817182550a942742d0b..9891f022541ecf738dee2bc1e3b8f1232aaa04a6`,
using `git merge-base origin/main HEAD` on branch `test`. This is **51
commits**, including merged RSVP branch history, and **274 changed files** in
the final diff. The local `origin/main` reference was `5f89dda`; it was not
fetched during this review.

Reviewed commit changes, relevant patches and merge resolutions, then checked
the surviving implementation at HEAD. The appendix accounts for every commit in
the range. These are release notes for the net change, not a list of commit
subjects. This was a source review: browser smoke tests, deployed services,
builds, and database migrations were **not run**. Every checkbox below remains
open.

## Release notes

### RSVP invitations and attendance confirmation

- Organizers can start RSVP waves for application events and configure a
  response window of **1–720 hours**, defaulting to **48 hours**. A wave's
  deadline is its creation time plus that window; changing the setting affects
  future waves.
- Waves invite approved applicants, oldest application first, up to the
  remaining event capacity. Existing attendees and anyone previously invited are
  excluded, including people whose invitation expired. Unlimited capacity
  invites all eligible applicants.
- A second wave cannot start while the previous wave is active. New waves stop
  once the event starts. The first wave is started manually; a daily job sends
  eligible follow-up waves after the previous deadline.
- Invitations are delivered asynchronously through a queue. Delivery tracking
  distinguishes unsent, queued, sent, and failed mail; publishing retries,
  consumer retries, and a daily recovery sweep cover different failure stages.
  Organizers can resend an individual pending invitation without creating
  another wave or extending its deadline.
- RSVP magic links use the remaining wave lifetime. Ordinary sign-in and
  user-invitation magic links retain their 24-hour lifetime.
- Attendees get a pending-invitation dialog with a live countdown,
  accept/decline controls, and an extra decline confirmation. Accepting records
  attendance; expired or already-answered invitations cannot be submitted again.
  Capacity is checked on acceptance.
- Dashboard badges and event-page status cards distinguish application approval
  from confirmed attendance. A person's latest RSVP takes precedence over their
  application status; expired invitations display as expired even before the
  scheduled timeout job runs.

### Event Terms

- Organizers can write event-specific Markdown terms from event settings. When
  terms exist, attendees must agree before accepting an RSVP; declining does not
  require agreement.
- Each terms edit creates an immutable version. Acceptance records the version
  and timestamp; submitting consent to a superseded version is rejected with a
  request to review the new terms.
- Terms appear in the event wiki and the RSVP interface. Organizers can see
  consent timestamps alongside invitation delivery status in the RSVP
  participant table.
- Removing current terms removes the requirement for future acceptances while
  preserving historical versions and acceptance records. The reader-facing terms
  page displays the **current** version.

### Organizer dashboard and applications

- The main dashboard and event list have revised management cards, counts, and
  event shortcuts. The event overview now combines summary tiles, description,
  application charts, question breakdowns, and wiki management.
- Applications, RSVP, teams, and check-in have their own pages. Event settings,
  description, application questions, and terms have dedicated editing pages.
  Breadcrumbs and back links reflect the event being viewed.
- Creating an event now starts with a compact **name-only dialog**. The event is
  initially a simple-signup event; configure its application, schedule, URL,
  capacity, location, and teams afterward in settings.
- Application rosters group profile information, application details, and
  optional answer columns. Reviewers can search, sort, change visible columns,
  download applicant resumes, and export CSV. CSV exports all supplied roster
  rows and active answer questions, including columns hidden in the table; it
  does not follow the table's search filter.
- Simple-signup events show a registered-attendee roster instead of application
  answers.
- Application reporting includes status totals, submissions over time, and
  supported questions marked for reports. Organizers can hide/show question
  charts using a browser preference scoped to the event. Multi-select
  percentages use respondents as the denominator, so their total can exceed
  100%.
- New `application:stats:all` and `rsvp:read:all` permissions support narrower
  visibility checks. Individual applicant data and resumes use
  `application:read:all`; see the permission limitation below before relying on
  read-only RSVP access.
- Optional settings can be cleared, and question-editor validation is shown
  inline. Changing application questions/settings refreshes affected dashboard
  data.

### Event URLs and wiki

- Events can have unique, readable URL slugs. Attendee and organizer routes
  accept either the slug or the UUID, including application, ticket, wiki, RSVP,
  teams, and check-in pages. Shared links prefer the slug; existing UUID links
  continue to work.
- Slugs are validated against invalid formats, UUID-shaped values, and reserved
  routes. Changing or clearing a slug updates the organizer's settings URL.
  Previous slugs are not maintained as aliases.
- Wiki management lives on the event overview, with separate article-editing
  pages. Organizers can create, publish/unpublish, delete, and drag articles
  into order. New articles append to the list.
- The attendee wiki has persistent article navigation. Its index opens the first
  visible article in the configured order, falling back to Event Terms if those
  are the only content. An empty wiki returns not found. Drafts remain limited
  to readers with `article:read:all`.
- Capacity display is optional and **defaults to hidden**, including for
  existing events after migration. This changes display, not the stored capacity
  or RSVP capacity checks.
- Application and RSVP cards share a consistent layout; the redundant
  “application required” event-page label was removed.

### Participation restrictions and test fixtures

- Once an event's end time passes, server actions reject new/edited
  applications, simple registration/unregistration, joining/leaving teams,
  member removal, scanned/manual check-in, and undoing check-in. Events without
  an end time do not automatically freeze.
- Applicants can edit answers only while their application is pending review.
  Approved, denied, and waitlisted applications are locked server-side.
- Demo seeding now creates richer application distributions, teams, RSVP
  histories, check-ins, and completed onboarding for the seeded admin. Fake
  users receive reusable PDF resumes from 20 committed fixtures; seeding does
  not require LaTeX.
- Added an RSVP wave CLI and an RSVP reset utility. The reset utility deletes
  wave/response history, including recorded consent, but leaves attendance,
  teams, and check-ins intact. It is not a full participation reset.

## Rollout findings to resolve or explicitly verify

### 1. Migration history is incompatible with a fully migrated merge-base database

**Release blocker for that upgrade path.** At the merge base,
`0037_sharp_hellion` adds `check_ins.checked_in_by` and has journal timestamp
`1789371869814`. HEAD renames identical SQL to `0039_sharp_hellion` with
timestamp `1789501394196`, while inserting the new RSVP migration at timestamp
`1788900844866`.

The installed Drizzle migrator selects migrations newer than the latest recorded
timestamp. A database already at the merge base therefore **skips the new RSVP
migration**, then **tries to add the existing check-in column again**. This was
verified by comparing both journals, comparing the SQL byte-for-byte, and
inspecting the installed migrator; no database was mutated. A successful clean
install would not validate this upgrade path.

Reconcile the migration history with the actual deployed `drizzle.journal`
before release, then rehearse the upgrade on a restored database. See
[migration journal](../drizzle/meta/_journal.json),
[RSVP migration](../drizzle/0037_rsvp_status_display_and_invitation_email.sql),
and [renumbered check-in migration](../drizzle/0039_sharp_hellion.sql).

Two additional data checks belong in that rehearsal: the RSVP migration makes
`respond_by` non-null without a backfill, and existing response rows receive
delivery status `unsent`. Existing pending, unexpired invitations could
consequently become eligible for the recovery sweep. Decide how existing
deliveries should be represented before enabling the jobs.

### 2. RSVP read permission and destination authorization disagree

The overview tile checks `rsvp:read:all`, but the event layout and RSVP read
actions require `event:manage`. A user with RSVP-read permission alone cannot
use the promised read-only destination, while an event manager can reach RSVP
actions without the tile's permission. Exercise both accounts; do not describe
this as complete read-only RSVP support yet. See
[summary tiles](<../src/app/dashboard/admin/events/[eventId]/(overview)/@summary/page.tsx>),
[event layout](../src/app/dashboard/admin/events/[eventId]/layout.tsx), and
[RSVP actions](../src/app/dashboard/admin/events/actions.ts).

### 3. “Freeze past events” is not a universal mutation guard

The listed participation actions enforce the event end time.
`submitRsvpResponse` checks the invitation deadline, but does **not** check the
event end time, and RSVP deadlines are not capped at the event start/end. A
still-valid invitation could therefore be accepted after the event ends. Include
that case in release acceptance; it is a known source-level gap if all
participation must freeze. Admin settings/content editing is also outside the
freeze's scope. See
[RSVP response action](../src/app/dashboard/events/actions.ts) and
[deadline calculation](../src/lib/rsvp/compute-rsvp-respond-by.ts).

## Deployment checklist

- [ ] **D1 — Existing-database upgrade.** Resolve finding 1, restore a copy of
      the deployed database, run the release migrations, then rerun them. Both
      runs succeed without duplicate columns or skipped RSVP schema. Check
      legacy null deadlines and existing invitation-delivery state explicitly.
- [ ] **D2 — Fresh install and static data.** Run migrations and static seeding
      on a disposable empty database. Verify RSVP display statuses, new
      permissions, terms tables, event slug uniqueness, response-window default
      `48`, and capacity-display default `false`. The removed `application_view`
      must not have an external consumer still depending on it.
- [ ] **D3 — Runtime configuration.** Set `CRON_SECRET` on Vercel and as a
      secret on the `workers/rsvp-cron` Cloudflare Worker (same value). There
      are no Vercel Cron entries.
      An authorized health report must include the required cron secret.
      Health only checks its presence, not actual queue delivery.
- [ ] **D4 — Scheduled jobs and queue.** Verify the deployed `rsvp-invitations`
      topic invokes `/api/queues/rsvp-invitation`. `/api/cron/rsvp` (follow-up
      waves, then the invitation requeue sweep) runs **hourly** from the
      `workers/rsvp-cron` Cloudflare Worker (`vercel.json` has no crons).
      Verify invocations in the Worker's Cron Events and deployment logs; a
      local UI run alone does not exercise this wiring.
- [ ] **D5 — Job authorization.** Missing/wrong bearer tokens return 401 without
      changing data. `CRON_SECRET` succeeds. A failed job produces a failure response/log instead of reporting
      success.

## Smoke-test outline

Use a staging deployment with test inboxes and storage. Prepare: an event
manager with all relevant feature permissions; an attendee; an account with
event management but no applicant/statistics/wiki permissions; and
narrow-permission accounts for the permission checks below. Use one future
application event with more approved applicants than seats, one simple-signup
event, one ended event, and one event without an end date. Include pending,
approved, denied, and waitlisted applications; invited, accepted, declined, and
expired RSVPs; and both published/draft wiki articles.

For a short first pass, do **D1–D5, A1–A3, R1–R4, T1–T2, U1, W1, P1, and F1**.
Complete the remaining checks before treating the whole change set as covered.
Check off only after recording the result on the actual release candidate.

### A — Organizer navigation, settings, and forms

- [ ] **A1 — Create an event.** Open Create Event on desktop and a narrow phone
      viewport. It asks only for a name, fits the screen, rejects a blank name
      inline, and creates exactly one event. Successful creation opens the new
      overview; the default has no application, no visible capacity, and a
      48-hour RSVP response window.
- [ ] **A2 — Configure and clear settings.** Set name, slug, schedule,
      location/geofence, capacity, application requirement, and team settings.
      Save, navigate away, and reopen. Clear optional fields and save again:
      they stay cleared, rather than reverting to old values. Invalid dates,
      coordinates, team size, and response windows show inline errors.
- [ ] **A3 — Full navigation loop.** Dashboard → event list → event overview →
      applications, RSVP, teams, check-in, settings, description, questions, and
      terms → back. Direct-load and refresh each destination; browser
      back/forward, breadcrumbs, and event name stay correct. No stale
      parallel-route panel, blank page, or persistent loading state.
- [ ] **A4 — Capacity visibility.** Set a small capacity and leave display off;
      attendees cannot see the capacity number. Turn it on and confirm the
      number appears. Turn it off again: admin counts remain available and
      accepting an RSVP still enforces the capacity.
- [ ] **A5 — Question editing.** Add/edit/reorder questions and options, toggle
      report visibility, and exercise numeric/character limits. Validation stays
      inline, failed saves preserve input, and successful changes appear in the
      application and appropriate reports. The old `/questions` and `/stats`
      destinations redirect to the overview; use settings to edit questions.
- [ ] **A6 — Dates and responsive UI.** Repeat schedule editing from two browser
      time zones. Reopening the form preserves the instant. Check event
      live/upcoming/ended badges, localized dates, header wrapping, table
      overflow, dialogs, and wiki navigation on mobile; no hydration warnings.

### R — RSVP lifecycle and real email delivery

- [ ] **R1 — First wave and selection.** With two free seats and at least three
      approved applicants, send a wave. Exactly the two oldest eligible
      applications are selected; non-approved applicants and existing attendees
      are excluded. Deadline matches the configured window. Confirm the dialog,
      queued count, persisted response rows, and receipt of actual emails.
- [ ] **R2 — Open and accept.** Open an invitation in a signed-out browser. It
      signs into the intended account and lands on the correct event with a
      countdown. Accept, then check the event page, dashboard/list badge, admin
      RSVP table, and attendance record. Ticket/wallet access for an eligible
      top-level event still works. Acceptance creates only one attendance
      record.
- [ ] **R3 — Decline and duplicate submissions.** Cancel the decline
      confirmation, then confirm it. Declined status persists and no attendee is
      created. Double-click/replay acceptance or decline and retry from a second
      tab: no duplicate attendance or reversal of a final answer.
- [ ] **R4 — Expiry and remaining capacity.** Open an invitation shortly before
      expiry and leave it open past the deadline. The UI expires, and submission
      is rejected server-side even without a timeout sweep. With one seat left,
      race two acceptances; at most one new attendee is added and the other gets
      a visible capacity error.
- [ ] **R5 — Wave guards.** Try a second send during an active wave, with no
      eligible applicants, with zero capacity, and after event start. Each is
      rejected without a new wave. Race two send requests and confirm only one
      active wave is created. Unlimited capacity selects all eligible
      applicants.
- [ ] **R6 — Follow-up scheduling.** Trigger the authorized daily job on
      prepared fixtures. It skips events with no prior wave, active waves, no
      seats, no eligible applicants, or an event that has started. After expiry
      it invites the next never-invited approved applicants.
      Expired/declined/accepted invitees are not recycled. A delay until the
      next daily run is expected.
- [ ] **R7 — Individual resend and token lifetime.** Resend a pending invitation
      from the participant table. It goes to the correct inbox, updates delivery
      status, and keeps the same wave/deadline. Accepted, declined, and expired
      invitations cannot be resent. Test an RSVP window longer than 24 hours and
      delayed delivery: token expiry follows the wave deadline. Ordinary sign-in
      and admin user-invitation links still work normally.
- [ ] **R8 — Delivery recovery.** In staging, force a transient queue-publish
      failure, then recover. Immediate publishing retries use the same response
      ID; a still-pending `unsent` row older than five minutes is picked up by
      the recovery sweep. Sent/queued/failed rows are not swept. Simulate
      consumer mail failure and eventual success; an already-sent replay does
      not send again. Permanent validation failures and retry exhaustion become
      `failed` and are visible to the organizer.
- [ ] **R9 — RSVP administration.** Search and filter attendees by RSVP and
      delivery status. Confirm counts, per-wave information, consent timestamps,
      and resend feedback. Change the response window: the active wave retains
      its deadline and the next wave uses the new setting. Check updates after
      soft navigation as well as reload.

### T — Event Terms and consent

- [ ] **T1 — Consent required only when configured.** Publish terms containing
      headings, links, and a long body. They render in the RSVP dialog and wiki.
      Accept is blocked until agreement; the server also rejects a submitted
      accept without consent. Decline works without consent. Successful
      acceptance stores both the terms version ID and timestamp.
- [ ] **T2 — Terms changed while a dialog is open.** Open terms version A as an
      attendee, save version B as an organizer, then submit A. The attendee gets
      an inline stale-terms error and can refresh/review/agree to B. No
      attendance or consent is partially saved on the rejected request.
- [ ] **T3 — Version retention and no-terms flow.** Accept A, then edit and
      remove current terms. The original accepted version and timestamp remain
      stored. A newly invited attendee can accept without a checkbox when no
      terms are configured. The current terms wiki route disappears when terms
      are removed; previously accepted users are not automatically asked to
      consent again.
- [ ] **T4 — Shared status UI.** Check pending review, approved without
      invitation, waitlisted with position, denied, RSVP pending, accepted,
      declined, and expired. The event card and dashboard badge agree; an
      approved application alone is not presented as a confirmed RSVP.
      Dismissing the prompt leaves usable inline RSVP controls.

### U — Slugs and route compatibility

- [ ] **U1 — Slug and UUID routes.** Configure a slug, then visit the attendee
      event, apply, ticket, and wiki pages and every organizer tool using both
      the slug and UUID. Share links and event tiles prefer the slug. Old
      invitation links containing UUIDs still work; requests reach the right
      event.
- [ ] **U2 — Rename, clear, and validate.** Change a slug while on its settings
      page; navigation moves to the new URL and saves persist. Clear it and
      confirm UUID fallback. Duplicate slugs, `team`, UUID-shaped values, and
      invalid formats are rejected inline. Unknown or old slugs return not found
      rather than another event.
- [ ] **U3 — Cross-route cache updates.** Keep slug and UUID versions open. Edit
      settings, apply, accept an RSVP, alter a team, check someone in, and edit
      an article; navigate between the overview and tools. Both URL forms show
      updated data without needing an unrelated mutation to refresh it.

### W — Wiki editing and reading

- [ ] **W1 — Article lifecycle and order.** Create two published articles and
      one draft from the overview, edit their Markdown/attachments, and reorder
      them by drag and keyboard. Reload to confirm persistence. The attendee
      sidebar follows published order; the wiki index opens its first visible
      item. A new article appends; removing the first article selects the next
      on the next index visit.
- [ ] **W2 — Draft and write permissions.** Ordinary attendees cannot list or
      directly open drafts; draft URLs return 404. An authorized draft reader
      can preview them. A reader without article-write permission cannot create,
      edit, publish, delete, or reorder, including through direct action
      requests.
- [ ] **W3 — Empty/wiki-only-terms cases.** No articles and no terms gives not
      found. Terms alone opens Event Terms. With articles plus terms, terms
      appear after the articles. `terms` is reserved and cannot be claimed by a
      new/renamed ordinary article; inspect existing articles for that slug
      before rollout.
- [ ] **W4 — Navigation and cache.** Open article editors from a slug-based
      admin URL, return to the overview, and follow reader links.
      Publish/unpublish/edit/delete/reorder and revisit both reader URL forms:
      content and sidebar update, active navigation stays correct, and drafts do
      not leak after an admin has warmed the cache. The removed admin `/wiki`
      page should have no remaining in-app links.

### P — Application data, statistics, and permissions

- [ ] **P1 — Applicant roster and resumes.** Search/sort/page the roster, toggle
      grouped columns, and inspect single-select, multi-select, “Other,”
      boolean, and blank answers. Download a resume. Logged-out requests return
      401; accounts without applicant-read permission return 403; missing
      resumes or users who did not apply to that event return 404.
- [ ] **P2 — CSV and simple registrations.** Export a roster with commas,
      quotes, and multiline answers. The file parses correctly, includes all
      roster rows and active question columns even when hidden/filtered on
      screen, and uses ISO submission timestamps. A simple-signup event shows
      registered attendees rather than an empty application table.
- [ ] **P3 — Report totals.** Use a small known dataset to check status totals,
      daily/cumulative submissions, single-select, multi-select, boolean, and
      numeric question charts. Questions not marked for reports and unsupported
      question types do not appear. Check no-response and empty-event states,
      zero-count options, and historical inactive options. Multi-select totals
      above 100% are expected.
- [ ] **P4 — Chart preferences.** Hide/show charts, hide all, then Show all.
      Preferences persist after reload and stay scoped to the event. Another
      browser starts with all charts visible. Denied/unavailable local storage
      does not break the page.
- [ ] **P5 — Narrow permissions.** Test event management combined separately
      with applicant-read, application-stats, check-in, team-read,
      article-read/write, and RSVP-read permissions. Unrelated tiles/sections
      stay hidden and direct routes/actions enforce their permissions. Test the
      RSVP-read-only account and event-manager-without-RSVP-read account against
      finding 2. Do not assume granting a role name is sufficient evidence.
- [ ] **P6 — Permission/cache changes.** Remove a permission while a tool is
      open, then retry a read/mutation. Server checks reject newly unauthorized
      access. Switching between a full manager and a restricted account must not
      reuse visible private data from the previous viewer.

### F — Past events and regression boundaries

- [ ] **F1 — Ended-event mutations.** After an event's end instant, try
      application submission/editing, simple registration/unregistration, team
      join/leave/member removal, scan/manual check-in, and undo. Each is
      rejected with no DB change, including admin member-removal overrides.
      Existing history remains readable.
- [ ] **F2 — Reviewed applications.** Pending-review answers remain editable
      before event end. Approved, denied, and waitlisted answers are rejected
      server-side even if an old tab still exposes a form.
- [ ] **F3 — Boundary exceptions.** An event without `endsAt` continues to allow
      the listed actions. Check upcoming/live events for normal registration,
      team membership, scan/manual check-in, duplicate-scan handling, and undo.
      Separately test a valid RSVP whose deadline extends past event end and
      resolve finding 3 if a universal freeze is required.
- [ ] **F4 — Existing ticket/check-in behavior.** Use an existing in-app ticket,
      Apple Wallet pass, and Google Wallet pass on the relocated check-in page.
      Correct-event scans work, wrong-event scans fail, and live roster counts
      update. Wallet generation itself predates this release; this is a
      routing/participation regression check.
- [ ] **F5 — Demo fixtures and reset tooling.** On a disposable database only,
      seed demo data and verify admin onboarding, both event types, realistic
      stats, teams, RSVP histories, check-ins, and PDF resumes. If using the
      reset utility, verify its actual CLI argument handling and its scope
      first: it deletes waves/responses/consent, retains
      attendees/teams/check-ins, and is blocked only when `NODE_ENV=production`.
      Never use it as a migration workaround.

Existing automated coverage includes RSVP selection/acceptance/retries/cron, a
1,000-invite wave case with mocked queue publishing, terms validation,
statistics, slugs, settings, seeding, and frozen actions. Run the relevant suite
against a dedicated test database after the migration issue is addressed, plus
the build/lint checks. The test setup migrates and truncates tables; it is not
suitable for a shared or production database. These tests do not establish real
email/queue delivery, browser navigation, or wallet scanning.

## Commit-by-commit review ledger

Order follows `git log --reverse 0824dc6..9891f02`; merged branch dates precede
the merge base in places. “Integration” means branch changes were consolidated,
not an additional user-facing feature. Intermediate behavior is called out where
it differs from HEAD.

| Commit    | Verified change / release disposition                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8f2e6bc` | Initial RSVP read/response actions, status display metadata, schema and static seed values. Foundation for R/T.                                                                                           |
| `45e9b3f` | “local” is a merge bringing test-branch work into RSVP; no separate combined resolution patch.                                                                                                            |
| `9313409` | “local” backfills existing RSVP lookup rows before adding non-null display constraints. D1/D2.                                                                                                            |
| `91e688a` | Integration merge of updated test work into RSVP; no separate combined resolution patch.                                                                                                                  |
| `e612389` | Wave creation/delivery logic, CLI helper, tests, and migration renumbering. Later delivery/window rules supersede the initial version.                                                                    |
| `4cd0720` | Restored Better Auth GET/POST handler on the feature branch; handler already exists at the merge base, so no net new auth endpoint.                                                                       |
| `29edb68` | RSVP-specific magic-link email generation and auth email routing. R2/R7.                                                                                                                                  |
| `0bbb872` | Attendee accept/decline UI, status card, latest-wave reading, and response tests. R2–R4.                                                                                                                  |
| `4073ea1` | Organizer wave control, eligibility and timeout handling. Its ability to reinvite expired users was later removed.                                                                                        |
| `c9513b1` | Scheduled follow-up waves, background magic-link send/resend helpers, cron configuration. Later commits replace its deadline policy.                                                                      |
| `59a3eb0` | Restored forbidden page and lint tooling on the branch; those restorations are not new release features relative to the base.                                                                             |
| `3a5b03a` | Transactional acceptance and capacity enforcement, duplicate-attendance protection, tests. R3/R4.                                                                                                         |
| `b50f577` | RSVP-aware dashboard/list badges and shared status mapping. R2/T4.                                                                                                                                        |
| `2f30bc9` | Derive expired pending invitations on reads rather than requiring a write sweep. R4.                                                                                                                      |
| `9e69fda` | Explicit event-zone RSVP formatting and intermediate wall-clock parser. The parser is later removed in favor of duration-based windows.                                                                   |
| `c132885` | Comment-only clarification that latest RSVP status takes precedence over application approval.                                                                                                            |
| `82f22bc` | Queue-backed invitations, delivery-state columns, consumer, idempotent publisher, auth mail context, and latest-response helpers. D/R.                                                                    |
| `e60b642` | Publish retries and stale-unsent recovery sweep; not a database-backup feature despite “backup” in the message. R8/D4.                                                                                    |
| `231ffd3` | 1,000-invite volume/duplicate-send tests using mocked queue publishing; not evidence of real mail throughput.                                                                                             |
| `f4a7bea` | Substantial merge reconciliation: consolidated RSVP migration, timezone/schema alignment, health requirement for cron, auth email integration, event status/loading changes. D1 is particularly relevant. |
| `5299f04` | Integration merge; no separate combined resolution patch.                                                                                                                                                 |
| `52f7247` | Shared cron authentication, optional manual token, required deadlines, send confirmation, constants and response-query refactoring. D/R.                                                                  |
| `345c020` | Per-event response-window setting, capacity-sized waves ordered by application age, active-wave locking, event-start guard, and no repeat invitations. Final selection policy.                            |
| `40f6547` | Magic-link expiry tracks the wave deadline; simplified scheduler. Its temporary hourly schedule is superseded.                                                                                            |
| `0c8b7cc` | Organizer RSVP lifecycle summary, participant filtering and settings UI; follow-up schedule set to daily. R6/R9.                                                                                          |
| `e5889f3` | Countdown invitation modal, decline confirmation, shared submission hook and attendee status wording. R/T.                                                                                                |
| `d8fc518` | RSVP helper/docs/test cleanup; removed obsolete local-time deadline parsing and unused timeline configuration.                                                                                            |
| `d6477cb` | Merge reconciliation of admin RSVP, attendee reads, nullable settings, route rendering, and check-in migration numbering. D1/A/P.                                                                         |
| `853cea8` | Formatting plus migration snapshot/journal cleanup; no independent attendee feature.                                                                                                                      |
| `4cc02c0` | Dependency security-version update, explicitly reverted by the next commit; not counted as a surviving upgrade.                                                                                           |
| `306fa9c` | Reverts `4cc02c0`. Current base already carries later audit fixes; no new framework-security-upgrade claim in these notes.                                                                                |
| `e7508d4` | Merge of RSVP feature PR #77; integrates the RSVP work above.                                                                                                                                             |
| `b3d616e` | Merges main, including the chosen merge base; no separate combined resolution patch.                                                                                                                      |
| `c5b0e63` | Application aggregation/report UI, statistics permission, chart dependencies, richer seeded answers; drops obsolete `application_view`. Final UI later moves into overview.                               |
| `009ec7b` | Dashboard/event-list management cards, participation counts and feature-specific shortcuts. A/P.                                                                                                          |
| `22ee683` | Major admin route/overview redesign, cached summaries, roster/CSV/resume endpoint, chart preferences, RSVP-read permission, and mutation cache invalidation. A/P; permission finding 2.                   |
| `04e98bc` | Permission/count and table/preference fixes; richer demo participation seeding and completed seeded-admin onboarding. A/P/F5.                                                                             |
| `30dfb0d` | Settings/description/question pages, breadcrumb/back navigation, clearable optional inputs and inline question errors. Old standalone stats UI removed; reports remain on overview.                       |
| `84192ed` | Removes the admin wiki index in favor of overview article controls and dedicated article editors. Wiki functionality remains. W.                                                                          |
| `422fb7e` | Unique event slug schema, validation and attendee URL resolution; shared slug helpers and ticket/apply/wiki support. U.                                                                                   |
| `1037eae` | Extends slug/UUID resolution throughout admin pages/actions/cache paths. “Segments” refers to URL segments, not a new event hierarchy. U/A.                                                               |
| `e0273fc` | Twenty reusable PDF/LaTeX resume fixtures, storage-backed resume seeding, and tests. P1/F5.                                                                                                               |
| `2c32818` | Persisted drag ordering for all wiki articles, append-on-create order, validation and cache updates. W1.                                                                                                  |
| `f520881` | Versioned terms/consent plus delivery-status filtering, individual resend UI, permanent mail-failure handling, concurrent publishing, reset CLI and fixtures. Broader than its subject. T/R/F5.           |
| `2bb4cdd` | Wiki sidebar/layout, terms rendered as reserved article, removal of old wiki dialog and separate terms route file. W.                                                                                     |
| `c617e95` | Shared application/RSVP event-page status cards with consistent timeline/actions. T4.                                                                                                                     |
| `67b5f03` | Wiki index redirects to first visible sidebar entry; terms fallback and empty-wiki not-found behavior. W3.                                                                                                |
| `eb298f8` | Removes redundant event-type/application-required label only; application requirements still apply.                                                                                                       |
| `79acef5` | Hidden-by-default capacity setting and migration, settings/header polish, shared wiki sidebar-list helper. A4/W3.                                                                                         |
| `39e8981` | Ended-event guards for applications, simple signups, team mutations and all check-in mutations; also locks reviewed/waitlisted application edits. F1–F3.                                                  |
| `9891f02` | Replaces the large creation form with a compact name-only dialog; remaining setup moves to event settings. A1.                                                                                            |
