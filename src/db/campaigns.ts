/**
 * Email campaigns database schema
 *
 * This module defines:
 * - saved_audiences: Named, reusable audience rule trees a campaign can link to
 * - campaigns: An email (subject + markdown body) and who it goes to, either
 *   inline rules or a linked saved audience, never both
 * - campaign_deliveries: One row per recipient per campaign, tracking that one
 *   email through the delivery queue
 *
 * Audiences are resolved at send time, never stored as a recipient list ahead
 * of it: the rules actually used are copied to `campaigns.audience_snapshot`
 * when a send starts.
 */

import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

import { user } from './auth-schema';
import { events } from './events-and-participation';

export const CAMPAIGN_TYPES = ['marketing', 'operational'] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_DELIVERY_STATUSES = [
  'queued',
  'sent',
  'failed',
  'skipped',
] as const;
export type CampaignDeliveryStatus =
  (typeof CAMPAIGN_DELIVERY_STATUSES)[number];

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '));

// ---------------------------------------------------------------------------
// Saved audiences
// ---------------------------------------------------------------------------

export const savedAudiences = pgTable('saved_audiences', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  /** Audience rule tree; validated by `audienceRulesSchema` before it's stored. */
  rules: jsonb('rules').$type<unknown>().notNull(),
  createdBy: uuid('created_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  updatedBy: uuid('updated_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    /**
     * `marketing` sends only to users who opted in and carries an unsubscribe
     * link. `operational` skips the consent filter, so it's restricted to the
     * participants of `eventId` (CASL).
     */
    type: text('type').$type<CampaignType>().notNull(),
    /**
     * The (top-level) event a campaign is about; required when operational.
     * Its campaigns go with it if the event itself is ever deleted.
     */
    eventId: uuid('event_id').references(() => events.id, {
      onDelete: 'cascade',
    }),
    subject: text('subject').notNull().default(''),
    previewText: text('preview_text').notNull().default(''),
    bodyMarkdown: text('body_markdown').notNull().default(''),
    /** Inline audience rule tree. Exactly one of this and `savedAudienceId` is set. */
    audienceRules: jsonb('audience_rules').$type<unknown>(),
    /**
     * A linked saved audience: the campaign always uses its current rules.
     * Deleting an audience a campaign still links to is refused (restrict).
     */
    savedAudienceId: uuid('saved_audience_id').references(
      () => savedAudiences.id,
      { onDelete: 'restrict' },
    ),
    /** The rules actually used, copied when the send starts. */
    audienceSnapshot: jsonb('audience_snapshot').$type<unknown>(),
    status: text('status').$type<CampaignStatus>().notNull().default('draft'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'campaigns_type_check',
      sql`${table.type} IN (${inList(CAMPAIGN_TYPES)})`,
    ),
    check(
      'campaigns_status_check',
      sql`${table.status} IN (${inList(CAMPAIGN_STATUSES)})`,
    ),
    check(
      'campaigns_operational_event_check',
      sql`${table.type} <> 'operational' OR ${table.eventId} IS NOT NULL`,
    ),
    check(
      'campaigns_one_audience_check',
      sql`(${table.audienceRules} IS NULL) <> (${table.savedAudienceId} IS NULL)`,
    ),
    index('idx_campaigns_status_scheduled_for').on(
      table.status,
      table.scheduledFor,
    ),
    index('idx_campaigns_saved_audience_id').on(table.savedAudienceId),
  ],
);

// ---------------------------------------------------------------------------
// Campaign deliveries (one per recipient per campaign)
// ---------------------------------------------------------------------------

export const campaignDeliveries = pgTable(
  'campaign_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Address resolved at dispatch, so results still read right if the user changes it. */
    email: text('email').notNull(),
    status: text('status')
      .$type<CampaignDeliveryStatus>()
      .notNull()
      .default('queued'),
    /** Why a delivery was skipped, or a note on a sent one (e.g. no wallet block). */
    skipReason: text('skip_reason'),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    queuedAt: timestamp('queued_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'campaign_deliveries_status_check',
      sql`${table.status} IN (${inList(CAMPAIGN_DELIVERY_STATUSES)})`,
    ),
    uniqueIndex('campaign_deliveries_campaign_id_user_id_unique').on(
      table.campaignId,
      table.userId,
    ),
    index('idx_campaign_deliveries_campaign_id_status').on(
      table.campaignId,
      table.status,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const savedAudiencesRelations = relations(
  savedAudiences,
  ({ many }) => ({
    campaigns: many(campaigns),
  }),
);

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  event: one(events, {
    fields: [campaigns.eventId],
    references: [events.id],
  }),
  savedAudience: one(savedAudiences, {
    fields: [campaigns.savedAudienceId],
    references: [savedAudiences.id],
  }),
  deliveries: many(campaignDeliveries),
}));

export const campaignDeliveriesRelations = relations(
  campaignDeliveries,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [campaignDeliveries.campaignId],
      references: [campaigns.id],
    }),
    user: one(user, {
      fields: [campaignDeliveries.userId],
      references: [user.id],
    }),
  }),
);
