<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Authorization: permissions, not roles — and not vague "admin" bundles either

Never gate a code path on a role slug (`hasRole`, `requireRole`, `session.role === 'admin'`, etc.). Roles are just named groupings of permissions in the DB (`role_permission` table) — a convenience for assigning many permissions at once, not an authorization primitive. Access checks must always go through a permission check (`hasPermission`, `hasAnyPermission`, `requirePermission`, `requireAnyPermission` in `src/lib/rbac/authorization.ts`).

This extends to UI visibility, not just route/action guards. Don't invent a shared "is this an admin" permission bundle to decide whether to show or hide a UI element (a nav link, a button, a stat tile). Each element should check the one specific permission that actually gates the feature it links to (e.g. the "Manage roles" button checks `role:read:all`, not a grab-bag list). If an element has no natural permission yet, add a new single-purpose one rather than reusing an unrelated one — this codebase has plenty of narrow permissions (`system:read:all` for the health endpoint is one) and that's the intended pattern; a permission is cheap, a wrong-shaped check that leaks or over-hides UI later is not. When none of a section's items are visible to the user, hide the whole section rather than rendering an empty shell.

Why: a role's permissions can be edited at runtime via the admin roles UI, so `hasRole(userId, 'admin')` silently drifts from intent the moment someone renames the role or reshuffles what it grants — the permission table is the actual source of truth. Likewise, a shared "admin-ish" permission list drifts from what any *specific* element actually requires the moment one of those permissions changes meaning or a new admin feature is added that doesn't fit the bundle. `hasRole`/`loadUserRoles` may still be used for read-only display (e.g. showing a user's role badges), just never for an authorization or visibility decision.
