import {
  pgTable,
  serial,
  text,
  integer,
  primaryKey,
  unique,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "@/db/schema";

// ─────────────────────────────────────────────
// Permissions
// entity:action:scope(self|all)
// ─────────────────────────────────────────────
export const permissions = pgTable(
  "permission",
  {
    id: serial().primaryKey(),
    key: text().notNull().unique(),
    description: text(),
  },
  (t) => ({
    uniq: unique().on(t.id, t.key),
  }),
);

// ─────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────
export const roles = pgTable("role", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
});

// ─────────────────────────────────────────────
// User ↔ Role
// ─────────────────────────────────────────────
export const userRoles = pgTable(
  "user_role",
  {
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "cascade",
    }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  }),
);

// ─────────────────────────────────────────────
// Role ↔ Permission
// ─────────────────────────────────────────────
export const rolePermissions = pgTable(
  "role_permission",
  {
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "cascade",
    }),
    permissionId: integer("permission_id").references(() => permissions.id, {
      onDelete: "cascade",
    }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  }),
);

// ─────────────────────────────────────────────
// User ↔ Permission (direct override)
// ─────────────────────────────────────────────
export const userPermissions = pgTable(
  "user_permission",
  {
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id").references(() => permissions.id, {
      onDelete: "cascade",
    }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.permissionId] }),
  }),
);
