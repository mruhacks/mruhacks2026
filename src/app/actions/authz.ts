type Entity = "user" | "registration" | "team" | "submission";

type Scope = "all" | "any" | "self" | { id: string };

// valid actions per entity
interface EntityActions {
  user: "create" | "read" | "update" | "delete";
  registration: "approve" | "reject" | "read";
  team: "create" | "join" | "manage";
  submission: "submit" | "review" | "read";
}

// optional: more specific UUID type for readability
type UUID = `${string}-${string}-${string}-${string}-${string}`;

// flat permission strings for fixed scopes
type StaticScope = Exclude<Scope, { id: string }>;
type StaticPermission = {
  [E in keyof EntityActions]: `${E}:${EntityActions[E]}:${StaticScope}`;
}[keyof EntityActions];

// dynamic (instance-specific) permissions
type DynamicPermission = {
  [E in keyof EntityActions]: `${E}:${EntityActions[E]}:${UUID}`;
}[keyof EntityActions];

// combined union of all allowed permission strings
type PermissionString = StaticPermission | DynamicPermission;

// ✅ valid examples
const a: PermissionString = "team:manage:all";
const b: PermissionString = "user:update:self";
const c: PermissionString =
  "submission:review:da5f4749-46ab-4770-8d22-b7395d08f8c7";

// ❌ invalid (wrong action for entity)
const d: PermissionString = "team:approve:any";

// ❌ invalid (malformed UUID)
const e: PermissionString = "user:update:not-a-uuid";
