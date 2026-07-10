import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from 'drizzle-orm/pg-core';

export const user = pgTable(
  'user',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    // Better Auth admin plugin fields
    role: text('role'),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires'),
  },
  (table) => [
    index('user_name_idx').on(table.name),
    index('user_created_at_idx').on(table.createdAt.desc()),
    index('user_email_trgm_idx').using(
      'gin',
      table.email.op('gin_trgm_ops'),
    ),
    index('user_name_trgm_idx').using(
      'gin',
      table.name.op('gin_trgm_ops'),
    ),
  ],
);

export const session = pgTable('session', {
  id: uuid('id').defaultRandom().primaryKey(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),

  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Better Auth admin plugin field
  impersonatedBy: text('impersonated_by'),
});

export const account = pgTable(
  'account',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // stores the OAuth provider's external user ID (e.g. GitHub numeric ID) or a UUID for email/password
    accountId: text('account_id').notNull(),

    providerId: text('provider_id').notNull(),

    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    scope: text('scope'),
    password: text('password'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = pgTable('verification', {
  id: uuid('id').defaultRandom().primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Per-user consent record. Stores privacy-related choices (e.g. opting in to
 * marketing/non-essential email) together with the timestamp the choice was
 * made, which is the auditable evidence of consent required under Canadian
 * privacy law (PIPEDA / Alberta PIPA) and GDPR. One row per user; cascades on
 * account deletion.
 */
export const userConsents = pgTable('user_consents', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** Opt-in to non-essential / marketing email. Defaults to off (no consent). */
  marketingEmails: boolean('marketing_emails').default(false).notNull(),
  /** When marketingEmails was last set to true; null if never opted in. */
  marketingConsentAt: timestamp('marketing_consent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Outstanding user invites. When an admin invites an email address, a row
 * lands here with the roles that should be applied on first sign-in.
 * Consumed and deleted by the /welcome page after the invitee clicks the
 * magic link.
 */
export const invite = pgTable('invite', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  roleIds: integer('role_ids').array().notNull().default([]),
  invitedBy: uuid('invited_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
