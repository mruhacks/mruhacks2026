/**
 * Permission string types and matching helpers.
 *
 * Permissions follow the hierarchical format `entity:action:scope`, e.g.
 *   - `user:read:all`
 *   - `application:review:all`
 *   - `registration:approve:<uuid>`
 *
 * A permission with `all` in a segment acts as a wildcard that covers any
 * value in that segment. This lets us grant broad powers (e.g. `user:all:all`)
 * without enumerating every concrete permission.
 */

export type PermissionEntity =
  | 'user'
  | 'role'
  | 'permission'
  | 'registration'
  | 'team'
  | 'event'
  | 'participant'
  | 'checkin'
  | 'application'
  | 'article'
  | 'system';

export type PermissionAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'manage'
  | 'approve'
  | 'reject'
  | 'submit'
  | 'review'
  | 'join'
  | 'write'
  | 'all';

export type PermissionScope = 'all' | 'any' | 'self' | (string & {});

export type PermissionString =
  `${PermissionEntity}:${PermissionAction}:${PermissionScope}`;

/**
 * Split a permission string into its entity/action/scope parts.
 * Tolerates short strings like `entity:action` (treated as scope `all`).
 */
export function parsePermission(permissionString: string): {
  entity: string;
  action: string;
  scope: string;
} {
  const [entity = '', action = '', scope = 'all'] = permissionString.split(':');
  return { entity, action, scope };
}

/**
 * Returns true when `granted` covers `required`.
 *
 * Rules:
 *  - Exact match always wins.
 *  - `all` in any segment of the granted permission acts as a wildcard.
 *  - `entity` must match exactly (or be `all`).
 */
export function permissionMatches(granted: string, required: string): boolean {
  if (granted === required) return true;

  const g = parsePermission(granted);
  const r = parsePermission(required);

  if (g.entity !== 'all' && g.entity !== r.entity) return false;
  if (g.action !== 'all' && g.action !== r.action) return false;
  if (g.scope !== 'all' && g.scope !== r.scope) return false;

  return true;
}

/**
 * Returns true if any granted permission covers the required permission.
 */
export function anyPermissionMatches(
  granted: Iterable<string>,
  required: string,
): boolean {
  for (const g of granted) {
    if (permissionMatches(g, required)) return true;
  }
  return false;
}

/**
 * Canonical list of permission slugs the app expects to exist. Used for
 * seeding, admin UIs, and validation.
 */
const CORE_PERMISSIONS = [
  { slug: 'user:read:all', description: 'View any user information' },
  { slug: 'user:write:all', description: 'Modify any user information' },
  {
    slug: 'user:all:all',
    description: 'Full user management (create/update/delete)',
  },
  { slug: 'role:read:all', description: 'View roles and their permissions' },
  { slug: 'role:write:all', description: 'Create, update and delete roles' },
  { slug: 'permission:read:all', description: 'View permissions' },
  {
    slug: 'permission:write:all',
    description: 'Create and delete permissions',
  },
  { slug: 'participant:read:all', description: 'View participant profiles' },
  { slug: 'participant:write:all', description: 'Edit participant data' },
  { slug: 'event:manage:all', description: 'Create and manage events' },
  { slug: 'team:read:all', description: 'View all formed teams for an event' },
  {
    slug: 'team:manage:all',
    description: 'Remove any team member (moderation override)',
  },
  { slug: 'checkin:write:all', description: 'Check participants in or out' },
  { slug: 'application:read:all', description: 'View event applications' },
  {
    slug: 'application:review:all',
    description: 'Approve or reject applications',
  },
  {
    slug: 'article:read:all',
    description: 'View unpublished event wiki articles',
  },
  {
    slug: 'article:write:all',
    description: 'Create, edit, publish and delete event wiki articles',
  },
  {
    slug: 'system:read:all',
    description: 'View system health and diagnostics',
  },
] as const;

/**
 * Canonical roles the app seeds by default.
 */
const CORE_ROLES = [
  { slug: 'admin', description: 'Full system administrator' },
  { slug: 'organizer', description: 'Manages event logistics and users' },
  { slug: 'judge', description: 'Evaluates hackathon projects' },
  { slug: 'volunteer', description: 'Supports event operations' },
  { slug: 'participant', description: 'Registered hackathon attendee' },
] as const;

export type CoreRoleSlug = (typeof CORE_ROLES)[number]['slug'];
export type CorePermissionSlug = (typeof CORE_PERMISSIONS)[number]['slug'];
