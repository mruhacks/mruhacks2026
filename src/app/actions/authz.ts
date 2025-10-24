"use server";

import { db } from "@/utils/db";
import { getUser } from "@/utils/auth";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { ok, fail, type ActionResult } from "@/utils/action-result";

/**
 * Loads all permission keys assigned to a given user.
 *
 * Includes both:
 *  - role-derived permissions
 *  - direct user-specific permissions
 *
 * @param userId - UUID or text identifier for the user
 * @returns A Set of permission keys, e.g. {"submission:edit:self", "event:all:all"}
 */
export async function getUserPermissions(
  userId: string,
): Promise<ActionResult<Set<string>>> {
  try {
    const result = await db.execute(sql`
      SELECT DISTINCT p.key
      FROM "permission" p
      LEFT JOIN role_permission rp ON rp.permission_id = p.id
      LEFT JOIN user_role ur ON ur.role_id = rp.role_id
      LEFT JOIN user_permission up ON up.permission_id = p.id
      WHERE ur.user_id = ${userId} OR up.user_id = ${userId};
    `);

    return ok(new Set(result.rows.map((r: any) => r.key as string)));
  } catch (e) {
    return fail(`Failed to load permissions: ${(e as Error).message}`);
  }
}

// ─────────────────────────────────────────────
// hasPermission()
// ─────────────────────────────────────────────

/**
 * Checks whether a user has the specified permission.
 *
 * Overloads:
 *  - `hasPermission(permissionKey)` → uses the currently authenticated user.
 *  - `hasPermission(userId, permissionKey)` → checks an arbitrary user.
 *
 * Hierarchical resolution:
 *  - `entity:action:self` → exact match
 *  - `entity:action:all`  → all scopes for this action
 *  - `entity:all:self`    → all actions for self
 *  - `entity:all:all`     → all actions for all users (entity-wide)
 *  - `entity:all`         → fallback granting all actions for entity
 *
 * @param userIdOrKey - user ID or permission key (depending on overload)
 * @param permissionKey - the permission key to check, e.g. "submission:edit:self"
 * @returns true if user has matching or broader permission; otherwise false.
 */
export async function hasPermission(permissionKey: string): Promise<boolean>;
export async function hasPermission(
  userId: string,
  permissionKey: string,
): Promise<boolean>;
export async function hasPermission(
  arg1: string,
  arg2?: string,
): Promise<boolean> {
  const userId = arg2 ? arg1 : (await getUser())?.id;
  const permissionKey = arg2 ? arg2 : arg1;
  if (!userId) return false;

  const perms = await getUserPermissions(userId);
  if (!perms.success) return false;

  const allPerms = perms.data!;
  if (allPerms.has(permissionKey)) return true;

  const [entity, action, scope] = permissionKey.split(":");

  // Apply hierarchical fallbacks
  return (
    allPerms.has(`${entity}:all`) ||
    allPerms.has(`${entity}:all:${scope ?? "self"}`) ||
    allPerms.has(`${entity}:${action}:all`) ||
    allPerms.has(`${entity}:all:all`)
  );
}

// ─────────────────────────────────────────────
// requirePermission()
// ─────────────────────────────────────────────

/**
 * Ensures that a user holds the required permission.
 *
 * Overloads:
 *  - `requirePermission(permissionKey)` → uses current authenticated user
 *  - `requirePermission(userId, permissionKey)` → checks explicit user
 *
 * If the permission check fails, redirects the client to:
 *   `/forbidden?reason=You%20do%20not%20have%20permission%20'X'`
 *
 * @param userIdOrKey - user ID or permission key (depending on overload)
 * @param permissionKey - the permission to enforce
 * @throws Redirects to /login if user not authenticated
 * @throws Redirects to /forbidden?reason=... if unauthorized
 */
export async function requirePermission(permissionKey: string): Promise<void>;
export async function requirePermission(
  userId: string,
  permissionKey: string,
): Promise<void>;
export async function requirePermission(
  arg1: string,
  arg2?: string,
): Promise<void> {
  const userId = arg2 ? arg1 : (await getUser())?.id;
  const permissionKey = arg2 ? arg2 : arg1;

  if (!userId) redirect("/login");

  const allowed = await hasPermission(userId!, permissionKey);
  if (!allowed) {
    const reason = encodeURIComponent(
      `You do not have permission '${permissionKey}'.`,
    );
    redirect(`/forbidden?reason=${reason}`);
  }
}
