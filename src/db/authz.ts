import { ColumnBaseConfig, ColumnDataType, sql } from 'drizzle-orm';
import {
  pgSchema,
  serial,
  text,
  check,
  ExtraConfigColumn,
  uuid,
  integer,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

export const authz = pgSchema('authz');

const lowerSlug = (table: {
  slug: ExtraConfigColumn<ColumnBaseConfig<ColumnDataType, string>>;
}) => check('lower_slug', sql`${table.slug} = lower(${table.slug})`);

export const permission = authz.table(
  'permission',
  {
    id: serial().primaryKey(),
    slug: text().unique().notNull(),
    description: text(),
  },
  (table) => [lowerSlug(table)],
);

export const role = authz.table(
  'role',
  {
    id: serial().primaryKey(),
    slug: text().unique(),
    description: text(),
  },

  (table) => [lowerSlug(table)],
);

export const userRole = authz.table(
  'user_role',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: integer()
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('user_role_role_id_idx').on(table.roleId),
  ],
);

export const userPermission = authz.table(
  'user_permission',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    permissionId: integer()
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.permissionId] }),
    index('user_permission_permission_id_idx').on(table.permissionId),
  ],
);

export const rolePermissions = authz.table(
  'role_permission',
  {
    roleId: integer()
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: integer()
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index('role_permission_permission_id_idx').on(table.permissionId),
  ],
);
