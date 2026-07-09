# Backend Security Review — MRUHacks 2026

**Scope:** All server-side code — Next.js server actions (`src/app/**/actions.ts`,
`src/app/actions/**`), route handlers (`src/app/api/**`), the RBAC layer
(`src/lib/rbac/**`, `src/app/actions/authz.ts`), auth/session config
(`src/utils/auth.ts`), database access (`src/utils/db.ts`, `src/db/**`), mail, and
configuration.

**Framework:** Next.js 16 (App Router) · Better Auth 1.4 · Drizzle ORM · PostgreSQL.

**Method:** Manual code audit mapped to the OWASP Top 10 (2021). No dynamic testing
was performed; findings are based on source review.

**Date:** 2026-07-09

---

## Executive summary

The application has a **well-designed RBAC model** and, for most of its surface,
correctly enforces authorization *inside* each server action (see
`src/app/actions/users.ts`, `src/app/dashboard/admin/events/actions.ts`). Input is
validated with Zod, all database access goes through Drizzle with **parameterized
queries** (no SQL-injection exposure was found), and there are no dangerous sinks
(`eval`, `dangerouslySetInnerHTML`, `sql.raw`, user-controlled SSRF).

However, there is **one critical, exploitable Broken Access Control flaw**: the entire
role/permission management module (`src/app/actions/roles.ts`) exposes privileged
mutation endpoints **with no authentication or authorization checks at all**. Because
these are React Server Actions referenced by client components, they are reachable as
public POST endpoints, and several of them can grant the `admin` role — yielding full
privilege escalation to super-admin and destructive tampering of the authorization
system.

| # | Finding | OWASP | Severity |
|---|---------|-------|----------|
| 1 | RBAC mutation server actions have no authz (`roles.ts`) | A01 | **Critical** |
| 2 | Unauthenticated disclosure of the RBAC model (`listRoles`/`listPermissions`/`getRolePermissions`) | A01 | Medium |
| 3 | `authz.ts` read actions accept arbitrary `userId` with no caller check | A01 | Low–Medium |
| 4 | Internal DB/error messages returned to the client | A05/A09 | Low–Medium |
| 5 | No security response headers (CSP, HSTS, X-Frame-Options, …) | A05 | Medium |
| 6 | No audit logging for privileged actions | A09 | Medium |
| 7 | Custom rate limiter is per-instance/in-memory | A07 | Low–Medium |
| 8 | `redirect()` swallowed inside `try/catch` in guards | A01 (robustness) | Low |
| 9 | No password strength/breach checks; 8-char minimum only | A07 | Low |
| 10 | Invites never expire | A04 | Low |

---

## A01 — Broken Access Control

### 🔴 Finding 1 (CRITICAL): RBAC management actions perform no authorization

**Files:** `src/app/actions/roles.ts` (entire file), consumed by
`src/app/dashboard/admin/roles/roles-table.tsx` and
`src/app/dashboard/admin/permissions/permissions-table.tsx`.

Every exported function in `roles.ts` is a `'use server'` action, yet **none** of them
call `getUser()`, `requirePermission()`, or any guard. They read and mutate the
authorization tables directly:

```ts
// src/app/actions/roles.ts — no auth anywhere in this file
export async function createRole(slug, description) { /* INSERT authz.role ... */ }
export async function deleteRole(roleId) { /* DELETE authz.role ... */ }
export async function updateRole(roleId, patch) { /* UPDATE authz.role ... */ }
export async function setRolePermissions(roleId, permissionIds) { /* replace role perms */ }
export async function grantPermissionToUser(userId, permissionId) { /* INSERT authz.user_permission */ }
export async function setUserRoles(userId, roleIds) { /* replace roles + set user.role='admin' */ }
// ...and 10 more, all unguarded
```

In Next.js, **a server action is a public HTTP endpoint.** Any function exported from a
`'use server'` module and referenced by a client component is registered with a stable
action ID and can be invoked by POSTing to any route with the `Next-Action` header — the
server runs it regardless of which page the caller can *see*. The `canWrite` prop in
`roles-table.tsx`/`permissions-table.tsx` only hides buttons in the UI; it does **not**
protect the endpoint. The admin page-level guards (`requireAuthWithPermission` in
`layout.tsx`/`page.tsx`) only gate *rendering the page*, not the actions.

**Confirmed reachable from the client bundle** (registered action IDs):
`createRole`, `updateRole`, `deleteRole`, `setRolePermissions`, `listRoles`
(via `roles-table.tsx`), and `updatePermission`, `deletePermission`, `listPermissions`
(via `permissions-table.tsx`).

**Exploitation — full privilege escalation to super-admin:**

1. Register/sign in as an ordinary participant (or, since no `getUser()` check exists,
   potentially with no session at all — only the action ID is required).
2. Call `createRole('admin')` (or read the existing admin role ID via the unguarded
   `listRoles()`), then `setRolePermissions(adminRoleId, [allPermissionIds])`.
3. Assign it to yourself. `setUserRoles(myUserId, [adminRoleId])` additionally sets
   `user.role = 'admin'` in the `user` table (see `roles.ts:355-358`), which the Better
   Auth **admin plugin** trusts — granting you `impersonateUser`, `setUserPassword`,
   `banUser`, `revokeUserSessions` over **every** account.

The result is complete compromise of the authorization system: read/modify all users'
roles and permissions, impersonate arbitrary users, reset any password, and delete or
rename core roles/permissions (`deleteRole`, `updateRole` can rename or drop the `admin`
role, a denial-of-service against administration).

**Why it matters:** This single file undermines every other correctly-enforced check in
the codebase. The rest of the app authorizes properly; this module is the bypass.

**Remediation:** Every exported action in `roles.ts` must authorize the caller. Add a
guard at the top of each action (return a typed failure rather than `redirect()` since
these are invoked from client code that consumes `ActionResult`):

```ts
import { getUser } from '@/utils/auth';
import { hasAnyPermission } from '@/app/actions/authz';

async function deny(required: string[]): Promise<ActionError | null> {
  const caller = await getUser();
  if (!caller) return fail('Not authenticated');
  if (!(await hasAnyPermission(caller.id, required))) {
    return fail('Forbidden: insufficient permissions');
  }
  return null;
}
```

Suggested permission per action (aligns with the existing `users.ts` conventions and the
`CORE_PERMISSIONS` list):

| Action(s) | Required (any of) |
|-----------|-------------------|
| `createRole`, `updateRole`, `deleteRole`, `grantPermissionToRole`, `revokePermissionFromRole`, `setRolePermissions` | `role:write:all`, `user:all:all` |
| `addPermission`, `updatePermission`, `deletePermission` | `permission:write:all`, `user:all:all` |
| `assignRoleToUser`, `revokeRoleFromUser`, `grantPermissionToUser`, `revokePermissionFromUser` | `user:write:all`, `user:all:all` |
| `listRoles` | `role:read:all`, `role:write:all`, `user:read:all`, `user:write:all`, `user:all:all` |
| `listPermissions` | `permission:read:all`, `role:read:all`, `role:write:all`, `user:read:all`, `user:write:all`, `user:all:all` |

> **Note on `setUserRoles` / `setUserDirectPermissions`:** these are *also* used as trusted
> internal primitives — `setUserRoles` is called by `consumeInvite()` for the invited
> user themselves (a non-admin) in `src/app/actions/users.ts:531`. If you add a
> `user:write:all` guard directly inside `setUserRoles`, legitimate invite consumption
> breaks. Preferred fix: keep these two as internal (server-only) primitives that are
> **not** exported to any client component, and expose only the already-guarded wrappers
> `updateUserRoles` / `updateUserDirectPermissions` (in `users.ts`) to the UI. The client
> currently does exactly that, so simply do not add new client imports of the raw setters,
> and guard the remaining actions as above.

**Also update the unit tests** (`src/tests/roles.test.ts`, `authz.test.ts`,
`authz-extended.test.ts`) that call these functions directly with no session — they will
need to mock `@/utils/auth` `getUser()` to return an authorized caller (and/or mock
`hasAnyPermission`) once guards are added.

---

### 🟠 Finding 2 (MEDIUM): Unauthenticated disclosure of the authorization model

`listRoles()`, `listPermissions()` (`roles.ts`) and `getRolePermissions()`
(`src/app/actions/authz.ts:106`) are exposed to the client (`roles-table.tsx` imports
`getRolePermissions`) with no caller check, leaking the full set of role slugs, permission
slugs, descriptions, and role↔permission mappings. This hands an attacker a map of the
privilege system (useful for Finding 1) and reveals internal structure. Fix as part of
Finding 1 (require an admin read permission).

### 🟡 Finding 3 (LOW–MEDIUM): `authz.ts` read actions accept an arbitrary `userId`

`getUserPermissions(userId)`, `getUserRoles(userId)`, `getDirectUserPermissions(userId)`,
`getRolesForUsers(userIds)`, `hasPermission(userId, …)`, `hasRole(userId, …)` are
`'use server'` exports with no verification that the caller may inspect that user. They
are the backbone of the auth system and are mostly invoked server-side with `caller.id`,
so guarding them naively risks breaking auth. Today only `getRolePermissions` is
client-referenced, but the pattern is fragile: **any** future client import of one of
these turns it into an enumeration endpoint for arbitrary users' roles/permissions.

**Remediation:** Separate the authorization boundary from data access — keep pure internal
helpers (not exported as actions) for server-side use, and expose only thin guarded
actions to clients. At minimum, add caller checks to any of these that a client component
imports.

### 🟡 Finding 8 (LOW, robustness): `redirect()` swallowed by `try/catch`

`requirePermission()` / `requireAnyPermission()` (`authz.ts`) call `redirect()`, which
works by throwing a `NEXT_REDIRECT` error. Several callers invoke them **inside** a
`try/catch` (e.g. `listUsers`, `getUserDetails` in `users.ts`). The catch swallows the
redirect and returns `fail('Failed to …: NEXT_REDIRECT')`. Access is still denied (the
throw aborts before the sensitive query), so this is **not** an access-control bypass, but
it relies on subtle control flow and yields confusing errors. Use
`import { unstable_rethrow } from 'next/navigation'` in catch blocks, or run guards before
the `try`, or have guards return typed `ActionResult` failures instead of redirecting when
called from actions.

### Access control — what is done correctly (for reference)

- `users.ts`: every action checks `getUser()` + `requirePermission('user:read:all' | 'user:write:all')`; `deleteUser`/`adminBanUser` refuse to target admins unless the caller is an admin, and block self-delete/self-ban.
- `dashboard/admin/events/actions.ts`: consistent `requirePermission(user.id, 'event:manage')` via `getAuthorizedUser()`.
- Participant self-service (`dashboard/events/actions.ts`, `register/actions.ts`, `profile/actions.ts`): all scope reads/writes to `user.id` — no IDOR found.
- Admin listing of applicant PII (`getApplicationResponses`) is gated behind `event:manage`.
- Better Auth admin plugin endpoints (impersonate/ban/setPassword) are server-enforced on `user.role === 'admin'`.

---

## A02 — Cryptographic Failures

- Passwords are hashed by Better Auth (scrypt); `setInitialPassword` uses
  `ctx.password.hash` rather than rolling its own. ✅
- `BETTER_AUTH_SECRET` / `AUTH_SECRET` and `BETTER_AUTH_URL` are read from env and the app
  **throws if missing** (`auth.ts:20-34`) — no hardcoded secret in code. ✅
- `.gitignore` excludes `.env*` (with `!.env.example`); no real secrets committed. ✅
- **Action:** The example DB password in `.env.example`
  (`g61Veraq1DssIKfsEk5zEzuwJTdozJHwHrQiOBCd`) is realistic-looking — confirm it is a
  throwaway and is **never** used in staging/production. Generate fresh secrets per the
  instructions already in that file.

## A03 — Injection

- All queries use Drizzle with **bound parameters**, including the raw-ish `sql`
  templates: `getUserPermissions` (`${userId}` is parameterized), the `listUsers`
  `EXISTS`/`ANY(${roleSlugs})` subquery, and search via `ilike(col, needle)`. No string
  concatenation into SQL, no `sql.raw`. ✅ **No SQL injection found.**
- No `eval` / `new Function` / `dangerouslySetInnerHTML`; React auto-escapes output
  (e.g. the reflected `email` on the forbidden page is safe). ✅
- Email bodies interpolate a `url` that is generated by Better Auth (not user input). ✅

## A04 — Insecure Design

- Strong points: typed `ActionResult`, Zod validation of profile/application/question
  inputs, replace-all mutations wrapped in transactions.
- Gap: the missing "secure by default" boundary on server actions (Finding 1). Consider a
  shared `authorizeAction(required)` helper (or a small higher-order wrapper) applied to
  every action so authorization can't be forgotten.
- **Invites never expire** — the `invite` table (`src/db/schema.ts:111`) has no expiry;
  `consumeInvite` matches purely on email. A stale invite could later grant roles to
  whoever eventually controls that address. Add an `expiresAt` and reject expired invites.

## A05 — Security Misconfiguration

- 🟠 **No security response headers.** `next.config.ts` defines no `headers()`. Add at
  least: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options:
  DENY` (or CSP `frame-ancestors 'none'` — the dashboard handles sessions and should not
  be frameable), `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.
- 🟡 **Verbose error messages.** Most actions do `fail(`… ${(e as Error).message}`)`,
  returning raw DB/internal errors to the client (e.g. `Failed to list users: <pg
  error>`). Log the detail server-side and return a generic message to callers.
- `cacheComponents: true` (Next 16) with `'use cache'` is only applied to non-user-specific
  data (`getOptions`, `getDefaultApplicationEvent`) — no user data is cached across
  requests. ✅ Keep this invariant in mind when adding new cached functions.
- `next/image` `remotePatterns` are restricted to known hosts. ✅

## A06 — Vulnerable & Outdated Components

- Core dependencies are current (Next 16.1.4, better-auth 1.4.17, drizzle-orm 0.44.7,
  zod 4). No obviously abandoned packages.
- **Action:** enable automated dependency/CVE scanning (Dependabot or `pnpm audit` in CI)
  and GitHub secret scanning; there is currently no security scanning workflow in
  `.github/workflows/`.

## A07 — Identification & Authentication Failures

- Email verification is required before password login (`requireEmailVerification: true`).
  ✅
- 🟡 **Custom rate limiter is in-memory** (`src/utils/rate-limit.ts` →
  `RateLimiterMemory`, used by `api/auth/send-verification-email`). This does not share
  state across instances / serverless invocations, so the limit is effectively per-process.
  Use a shared store (the Better Auth DB rate limiter, or Redis) for anything
  security-relevant. Confirm Better Auth's DB rate limiting (configured in `auth.ts`) is
  active in production for login and password-reset.
- 🟡 **Password policy is minimal** — 8-char minimum, no complexity or breached-password
  check (`signup/schema.ts`, `setInitialPassword`). Consider zxcvbn or a HIBP range check.
- Admin can revoke sessions and ban users; self-ban/self-delete are blocked. ✅

## A08 — Software & Data Integrity Failures

- Application answers are validated per-question with Zod before persistence
  (`buildApplicationResponses`) and question edits are validated
  (`validateQuestionEdit`). ✅
- Profile + application writes are transactional (`registerParticipant`). ✅
- No untrusted deserialization or third-party script inclusion. ✅

## A09 — Security Logging & Monitoring Failures

- 🟠 **No audit trail.** Privileged operations (role/permission changes, bans, deletions,
  password sets, impersonation) are not logged — `dashboard/admin/events/actions.ts` is
  littered with `// TODO: Log audit trail`. Combined with Finding 1, a privilege-escalation
  attack would leave no record. Add structured audit logging (actor, action, target,
  timestamp) for all admin mutations, and ship logs somewhere durable.
- Errors are only `console.error`'d; there is no monitoring/alerting hook.

## A10 — Server-Side Request Forgery

- No server-side fetch of user-supplied URLs. `mailhog.ts` fetches a fixed env URL used
  only in tests; `next/image` hosts are allow-listed. ✅ **No SSRF found.**

---

## Prioritized remediation plan

1. **Now (Critical):** Add authorization to every action in `src/app/actions/roles.ts`
   (Findings 1 & 2). Update the affected unit tests. This closes the privilege-escalation
   path.
2. **Soon (Medium):** Add security response headers (A05); implement audit logging for
   admin mutations (A09); stop leaking internal error strings (A05); move rate limiting to
   a shared store (A07).
3. **Hardening (Low):** Guard/refactor the `authz.ts` read actions (Finding 3); add invite
   expiry (A04); strengthen the password policy (A07); use `unstable_rethrow` in guard
   `try/catch` blocks (Finding 8); enable dependency + secret scanning in CI (A06).

---

*Prepared as a static source review. Recommend following up the Finding 1 fix with a
lightweight integration test that asserts an unauthorized caller receives `Forbidden`
from each `roles.ts` action, to prevent regressions.*
