type Scope = "all" | "any" | "self" | { id: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Entity = "user" | "registration" | "team" | "submission";


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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PermissionString = StaticPermission | DynamicPermission;
