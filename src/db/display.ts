/**
 * Lobby displays: wall screens showing the featured event's banner, sponsors
 * and schedule from the public `/display` page. Screens hold no credentials;
 * the only thing stored is the settings every screen follows, edited from
 * the admin dashboard.
 */

import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { user } from './auth-schema';

export type DisplayTheme = 'light' | 'dark';

/** Settings every screen follows. Exactly one row, `id = 1`. */
export const displaySettings = pgTable(
  'display_settings',
  {
    id: integer('id').primaryKey().default(1),
    showClock: boolean('show_clock').default(false).notNull(),
    theme: text('theme').$type<DisplayTheme>().default('light').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    updatedByUserId: uuid('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    check('display_settings_singleton_check', sql`${table.id} = 1`),
    check(
      'display_settings_theme_check',
      sql`${table.theme} in ('light', 'dark')`,
    ),
  ],
);
