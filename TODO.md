# Task Breakdown

## Auth / Login

1. **Fix false "incorrect password" error after magic link is sent**
   Pressing Enter on the sign-in page after a magic link has been sent incorrectly triggers a "wrong password" prompt. The form should recognize magic-link state and not fall through to password validation.

2. **Fix Enter key not blocking duplicate submissions on login**
   Pressing Enter on the login page doesn't disable the form/button, so repeated Enter presses can trigger duplicate submit actions. Add submit-in-progress guard (disable button + ignore repeat keydown while a request is in flight).

3. **Block access to login page when already authenticated**
   Logged-in users should be redirected away from `/login` (e.g., to dashboard) instead of being able to view the login form.

## Events

4. **Separate "application required" from "questions" on event creation**
   Decouple the "requires application" toggle from event questions. An event can require an application without necessarily having custom questions attached.

5. **Clarify application flow when application is required**
   When an event requires an application, ensure the user is routed through the application-entry flow correctly (spec is incomplete here — needs follow-up: what should happen if application is required but has no questions?).

6. **Remove the public `/register` URL**
   The register route should not exist / not be publicly accessible. Confirm intended entry point (invite-only? admin-created?) and remove or gate the route accordingly.

7. **Convert application responses view from table to list**
   Replace the current table layout for viewing application responses with a list view, reusing the existing TanStack table/list components used for the user table.

## Welcome Page

8. **Don't show "Welcome back" on first login**
   First-time login should show first-time copy, not returning-user copy. Requires tracking first-login state.

9. **Move full profile creation into the welcome flow**
   Relocate profile creation into the welcome page as a multi-step flow with a clear progress indicator.

10. **Make ToS/Privacy Policy acceptance a form validation**
    Convert "you must accept the terms of use and privacy policy" into a proper form validation error rather than a separate check/message.

11. **Allow welcome page to be bypassed when no action is required**
    If the user has nothing outstanding to complete (profile already done, terms already accepted, etc.), skip the welcome page entirely.

## Profile

12. **Add resume upload (optional)**
    Allow users to optionally upload a resume on their profile.

13. **Add profile picture upload**
    Allow users to upload/set a profile picture.

## Register Flow

14. **Hide registration questions for events without an application process**
    If an event has no application process, don't show application/registration questions during registration.

## Infrastructure

15. **Migrate `middleware.ts` to `proxy.ts` (Next.js)**
    Next.js has deprecated the "middleware" file convention in favor of "proxy." Currently both `./src/middleware.ts` and `./src/proxy.ts` exist, causing an unhandled rejection at runtime. Consolidate into `./src/proxy.ts` only and delete `middleware.ts`.
    Ref: https://nextjs.org/docs/messages/middleware-to-proxy

## Security — Critical (fix now)

16. **Add authorization checks to `roles.ts` actions (Finding 1 & 2)**
    `listRoles()`, `listPermissions()`, and `getRolePermissions()` (used client-side in `roles-table.tsx`) have no caller/permission check, exposing the full role/permission model (slugs, descriptions, mappings) to any unauthenticated or unprivileged caller. Add a required admin read-permission check (e.g. `requirePermission`) to every export in `roles.ts` and to `getRolePermissions()` in `authz.ts`. Update unit tests to assert unauthorized callers get `forbidden`.

## Security — Medium (fix soon)

17. **Add security response headers**
    `next.config.ts` defines no `headers()`. Add CSP, `Strict-Transport-Security`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.

18. **Add audit logging for privileged admin actions**
    Role/permission changes, bans, deletions, password sets, and impersonation are currently unlogged (multiple `// TODO: log audit trail` markers in `dashboard/admin/events/actions.ts`). Implement structured audit logging (actor, action, target, timestamp) and ship logs somewhere durable.

19. **Stop returning raw error strings to clients**
    Many actions do `fail(\`… ${(e as Error).message}\`)`, leaking internal/DB error details. Log full error server-side; return a generic message to the caller.

20. **Move rate limiting to a shared store**
    The custom rate limiter (`src/utils/rate-limit.ts`, `RateLimiterMemory`) is in-memory and per-process, so it doesn't work correctly across multiple instances/serverless invocations. Migrate to a shared store (Redis, or confirm and rely on Better Auth's DB-backed rate limiter for login/password-reset in production).

## Security — Hardening (lower priority)

21. **Guard or refactor `authz.ts` read actions against arbitrary `userId` (Finding 3)**
    `getUserPermissions`, `getUserRoles`, `getDirectUserPermissions`, `getRolesForUsers`, `hasPermission`, `hasRole` are exported server actions with no caller-may-inspect-this-user check. Separate internal helpers (server-only, not exported as actions) from thin, guarded client-facing actions to prevent future accidental exposure.

22. **Add expiry to invites**
    The `invite` table has no `expiresAt`, and `consumeInvite` matches purely on email — a stale invite could later grant roles to whoever controls that address later. Add `expiresAt` and reject expired invites.

23. **Strengthen password policy**
    Current policy is an 8-character minimum with no complexity or breached-password check. Consider zxcvbn scoring or an HIBP range check.

24. **Fix `redirect()` swallowed by try/catch (Finding 8)**
    `requirePermission()` / `requireAnyPermission()` throw via `redirect()`, but several callers (e.g. `listUsers`, `getUserDetails` in `users.ts`) invoke them inside `try/catch`, which swallows the redirect and returns a confusing `failed to …: NEXT_REDIRECT` error. Not an access-control bypass, but fix by using `unstable_rethrow` from `next/navigation` in catch blocks, running guards before the `try`, or having guards return typed `ActionResult` failures.

25. **Enable dependency and secret scanning in CI**
    No CVE/dependency scanning or secret scanning workflow currently exists. Add Dependabot or `pnpm audit` to CI, and enable GitHub secret scanning.

26. **Confirm `.env.example` DB password is a placeholder**
    Verify the realistic-looking example DB password in `.env.example` is a throwaway, never used in staging/production, and that fresh secrets are generated per existing instructions in that file.
