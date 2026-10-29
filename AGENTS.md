<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Running in a cloud agent container

In a sandboxed cloud container (no Docker, proxied network), don't rediscover the environment: run `bash scripts/cloud-dev-setup.sh && source /tmp/mruhacks-dev.env` and follow `docs/CLOUD_AGENT_SETUP.md`. It covers the database, env vars, tests, starting the dev server, logging in without Turnstile, and taking screenshots. If you hit a new environment snag and work around it, add it to that doc.

# Authorization: permissions, not roles — and not vague "admin" bundles either

Never gate a code path on a role slug (`hasRole`, `requireRole`, `session.role === 'admin'`, etc.). Roles are just named groupings of permissions in the DB (`role_permission` table) — a convenience for assigning many permissions at once, not an authorization primitive. Access checks must always go through a permission check (`hasPermission`, `hasAnyPermission`, `requirePermission`, `requireAnyPermission` in `src/lib/rbac/authorization.ts`).

This extends to UI visibility, not just route/action guards. Don't invent a shared "is this an admin" permission bundle to decide whether to show or hide a UI element (a nav link, a button, a stat tile). Each element should check the one specific permission that actually gates the feature it links to (e.g. the "Manage roles" button checks `role:read:all`, not a grab-bag list). If an element has no natural permission yet, add a new single-purpose one rather than reusing an unrelated one — this codebase has plenty of narrow permissions (`system:read:all` for the health endpoint is one) and that's the intended pattern; a permission is cheap, a wrong-shaped check that leaks or over-hides UI later is not. When none of a section's items are visible to the user, hide the whole section rather than rendering an empty shell.

Why: a role's permissions can be edited at runtime via the admin roles UI, so `hasRole(userId, 'admin')` silently drifts from intent the moment someone renames the role or reshuffles what it grants — the permission table is the actual source of truth. Likewise, a shared "admin-ish" permission list drifts from what any _specific_ element actually requires the moment one of those permissions changes meaning or a new admin feature is added that doesn't fit the bundle. `loadUserRoles` may still be used for read-only display (e.g. showing a user's role badges), just never for an authorization or visibility decision.

# New permissions go in the seed, not a migration

When you add a permission (or grant one to a role), add it to `CORE_PERMISSIONS` in `src/lib/rbac/permissions.ts` and to `scripts/seed-static.ts` only. Don't write a Drizzle migration that `INSERT`s it into `authz.permission` / `authz.role_permission`. Migrations are for schema changes; older ones like `0052_expo_judging` and `0054_onboarding_skip_permission` that seed permissions are not a pattern to copy.

Why: every deploy (`.github/workflows/migrate-and-seed.yml`) and every local `db:seed`/`db:reset` runs `seed-static.ts` right after migrating, and it upserts every permission and grants `admin` all of them. A data-only migration is redundant. It adds a SQL file, a full schema snapshot and a journal entry to the PR, and leaves two copies of the same permission data that can drift apart.

# Form submission errors: inline, not toasts

Never surface a form submission's validation/error result as a toast (`sonner`'s `toast.error`). Show it inline, next to the field or form it belongs to — e.g. `FieldError` from `@/components/ui/field`, or a plain error message rendered under the input/submit button. Track the error in local state (or via the form library's own error state) and clear it when the user edits the field or reopens the form.

Toasts are still fine for things that aren't form-submission errors: success confirmations (registered, joined, copied), and simple non-form action failures (e.g. a button-only action like "leave team" or "remove member" that has no input to attach an inline error to).

Why: a toast disappears and doesn't stay anchored to the field that caused the problem, so the user has to remember what went wrong and where to fix it — bad UX for anything the user is actively trying to fill in and resubmit. Inline errors stay visible exactly where the user is looking and next to the control they need to correct.

# New external config gets a health check

Whenever you add a new external dependency — a secret/env var for a third-party service, or a URL the app relies on at runtime (a hosted asset, an API endpoint) — wire it into `src/app/api/health/route.ts`, not just `.env.example`. At minimum, add its env var(s) to `REQUIRED_ENV_VARS` so a missing one shows up in `missingEnv`. Where it's possible to actually verify the thing works (not just that the env var is non-empty), add a dedicated `checkX()` function and a `checks.x` entry too — e.g. `checkTurnstile` posts a bogus token to Cloudflare's siteverify endpoint, `checkGoogleWallet` does a `HEAD` request against the externally-hosted logo URL Google's servers fetch directly.

Never decode, parse, or otherwise load a secret's actual contents (a private key, a certificate) into memory just to answer a health probe — `checkAppleWallet` is presence-only for exactly this reason, since the signer key env var holds private key material and this route has no other reason to ever touch it. A live check is only appropriate when it exercises a public endpoint or a value that isn't sensitive on its own (a public logo URL, an issuer ID).

Why: these are exactly the failure modes that go unnoticed until someone tries the feature — an expired secret, a typo'd env var, a dead CDN link — because nothing else in the app proactively checks them. The health endpoint is the one place already designed to surface that (cached, permission-gated, already polled by uptime tooling), so a new integration that skips it silently breaks with no signal until a user hits it.

# Datetimes: backend speaks UTC instants only, frontend localizes

The backend — DB columns, server actions, server components — only ever handles UTC instants. It never parses a bare wall-clock string (`new Date("2026-05-13T14:30")` has no zone and silently binds to whatever process runs it) and never formats a date without an explicit `timeZone`. Every `timestamp` column is `timestamp with time zone` (`{ withTimezone: true }` in Drizzle); a naive column can't tell UTC apart from any other zone, which is exactly what caused this rule to be written.

Client-supplied dates (currently the two `datetime-local` event fields) are converted to an ISO instant with `fromDateTimeLocalValue`/`toDateTimeLocalValue` (`src/lib/datetime.ts`) in the browser, validated server-side as `z.iso.datetime({ offset: true })`, and never touched with a bare `new Date(inputString)` on the server.

All date/time **display** goes through `LocalDateTime` / `LocalDateRange` (`src/components/local-date-time.tsx`), never a one-off `Intl.DateTimeFormat` or `.toLocaleString()`. These render `EVENT_TIME_ZONE` during SSR (so first paint is identical for every viewer, required for anything inside a `'use cache'` boundary) and swap to the viewer's detected zone after hydration.

Why: `Intl.DateTimeFormat(undefined, …)` resolves to whichever _process_ is rendering — the server's zone for a server component, the viewer's for a client component — so the same instant rendered two ways showed two different times, and an event's own edit form drifted by the server's UTC offset every time it was opened and saved. Pinning the data layer to instants and pushing all zone conversion to the one shared frontend module removes the ambiguity at its source instead of re-deriving the correct zone at every call site.

# Imports: namespaces for big modules, relative for neighbours

Two lint rules (`eslint-rules/namespace-imports.mjs`, `eslint-rules/nearby-relative-imports.mjs`) enforce this, and `pnpm lint --fix` rewrites most violations for you.

- **Schema:** `import * as schema from '@/db/schema'` and use `schema.events`, `schema.teams`, … Never a named-import list.
- **Domain modules:** every folder under `src/lib/` with a `server.ts` (`auth`, `campaigns`, `dietary`, `display`, `judging`, `participation`, `rbac`, `rsvp`, `signing`, `wallet`) is imported from outside as one PascalCase namespace named after the folder: `import * as Rsvp from '@/lib/rsvp/server'` → `Rsvp.sendRsvpWave(...)`. No deep imports like `@/lib/rsvp/waitlist`. Each module has two entry points:
  - `@/lib/<domain>` (`index.ts`): the client-safe files, plus the _types_ of the server-only ones. Client components use this.
  - `@/lib/<domain>/server` (`server.ts`): `server-only`, re-exports `index.ts` plus every server-only file. Server code uses this.

  When you add a file to a module, add it to the right barrel: `server.ts` if it (transitively) touches the DB, auth, `server-only` or Node APIs, otherwise `index.ts` — and add an `export type *` line for server files in `index.ts`. Files inside a module import each other relatively, never through their own barrel. Exports don't repeat the module name, since callers already write it as the namespace: `Display.Feed`, not `Display.DisplayFeed` (same for `displayFeed`, `DISPLAY_FEED`, and the singular: `Campaigns.Status`, not `Campaigns.CampaignStatus`). `src/db/**` is exempt so the schema doesn't load whole modules. New domain: create the folder with both barrels and it's picked up automatically.

- **Nearby files are relative, everything else uses `@/`:** a file imports relatively anything inside its parent directory (or its own directory, when the parent is `src/` or a top-level area like `src/app`/`src/lib`), so a relative path never climbs more than one `../`. E.g. in `src/app/dashboard/events/[eventId]/page.tsx`, `'../team/TeamPanel'`, not `'@/app/dashboard/events/team/TeamPanel'`.

Why: long named-import lists from the schema, UI and domain folders were wrapping into multi-line blocks across hundreds of files. A namespace keeps it to one line per module however much of it is used, and the PascalCase alias can't collide with the local variables that tend to share a domain's name (`const participation = …`).
