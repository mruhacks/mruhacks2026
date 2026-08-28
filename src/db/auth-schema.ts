import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const user = pgTable(
  'user',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    /**
     * Display name from the OAuth provider, kept only when the provider
     * actually supplied one — GitHub falls back to the account handle for
     * `name`, which is fine to display but wrong to pre-fill into a profile's
     * Full Name. Unlike `name`, this is never overwritten by a profile save.
     */
    oauthName: text('oauth_name'),
    /** Set after the user has completed every required welcome step. */
    onboardingCompletedAt: timestamp('onboarding_completed_at'),
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
    index('user_email_trgm_idx').using('gin', table.email.op('gin_trgm_ops')),
    index('user_name_trgm_idx').using('gin', table.name.op('gin_trgm_ops')),
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
 * Tracks the last time a magic-link sign-in email was sent to an address, so
 * a burst of requests (double submit, multiple tabs, retries) doesn't flood
 * the same inbox — see the 60s cooldown check in `auth.ts`. This table is
 * UNLOGGED (see its migration): losing a row on crash just lets one extra
 * email through, which isn't worth paying WAL overhead to prevent.
 */
export const magicLinkCooldown = pgTable('magic_link_cooldown', {
  email: text('email').primaryKey(),
  lastSentAt: timestamp('last_sent_at').defaultNow().notNull(),
});

/**
 * Consent is stored as one table per consent type. Terms-of-Use and
 * Privacy-Policy acceptances are append-only histories (one row per
 * acceptance, tagged with the document version), so re-acceptance after a
 * policy update is preserved as auditable evidence required under Canadian
 * privacy law (PIPEDA / Alberta PIPA) and GDPR. Marketing consent is a single
 * current-state row per user, since it is a toggle the user flips over time.
 * All three cascade on account deletion.
 */

/** Append-only log of Terms-of-Use acceptances. */
export const termsAcceptances = pgTable(
  'terms_acceptances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Version identifier of the Terms document the user accepted. */
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at').defaultNow().notNull(),
  },
  (table) => [index('terms_acceptances_user_id_idx').on(table.userId)],
);

/** Append-only log of Privacy-Policy acceptances. */
export const privacyAcceptances = pgTable(
  'privacy_acceptances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Version identifier of the Privacy Policy the user accepted. */
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at').defaultNow().notNull(),
  },
  (table) => [index('privacy_acceptances_user_id_idx').on(table.userId)],
);

/**
 * Current marketing / non-essential email preference. One row per user;
 * `changedAt` is the auditable timestamp of the most recent opt-in or opt-out.
 */
export const marketingConsents = pgTable('marketing_consents', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** Whether the user has opted in to non-essential / marketing email. */
  optedIn: boolean('opted_in').default(false).notNull(),
  /** When `optedIn` was last changed. */
  changedAt: timestamp('changed_at').defaultNow().notNull(),
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
  /** Invites are short-lived so a recycled email address cannot inherit roles. */
  expiresAt: timestamp('expires_at')
    .default(sql`now() + interval '7 days'`)
    .notNull(),
});

export const rateLimit = pgTable('rate_limit', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key'),
  count: integer('count'),
  lastRequest: bigint('last_request', { mode: 'number' }),
});

/** Durable, append-only record of privileged administrative activity. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_log_actor_id_idx').on(table.actorId),
    index('audit_log_created_at_idx').on(table.createdAt.desc()),
  ],
);
