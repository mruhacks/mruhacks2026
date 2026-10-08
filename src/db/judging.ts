/**
 * Expo judging schema (Gavel-style pairwise comparison, see
 * `@/lib/judging/crowd-bt`).
 *
 * - judging_criteria: What judges compare on, per event. One Crowd-BT model each.
 * - event_judges: The roster. A row exists from the moment an organizer adds
 *   an email and links to the user on sign-in; it outlives the account so its
 *   votes stay grouped (then shown as "Deleted judge #…").
 * - judging_votes: One row per criterion per comparison.
 * - judge_reliability / submission_scores: The *online* model state, used only
 *   for dispatch. Results replay the votes instead (`@/lib/judging/results`).
 * - judge_state / judge_skips: Where each judge is, and what they've passed on.
 * - judge_notes: A judge's private note on a project, keyed on the user so it
 *   goes with the account.
 *
 * Votes reference judges and criteria with `no action`, not `restrict`: it's
 * checked at the end of the statement, so deleting the event (which cascades
 * to submissions and from there to votes) still works, while deleting a judge
 * or criterion that has votes fails — the same trick as `submissions.team_id`.
 */

import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { user } from './auth-schema';
import { events, submissions } from './events-and-participation';

export const judgingCriteria = pgTable(
  'judging_criteria',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    /** One line, shown to judges under the name. */
    description: varchar('description', { length: 300 }).notNull().default(''),
    position: integer('position').notNull(),
    /** Only re-sorts the Overall results table; never touches votes. */
    weight: doublePrecision('weight').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_judging_criteria_event_id').on(table.eventId),
    check('judging_criteria_weight_nonnegative', sql`${table.weight} >= 0`),
  ],
);

export const eventJudges = pgTable(
  'event_judges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** Lowercased. Cleared with the account; null afterwards. */
    email: varchar('email', { length: 255 }),
    /** Linked on sign-in by email; null before then and after account deletion. */
    userId: uuid('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    /** When the invite email went out; null while it hasn't been sent. */
    inviteSentAt: timestamp('invite_sent_at', { withTimezone: true }),
    /** A disabled judge isn't dispatched; their votes still count. */
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('event_judges_event_id_email_unique')
      .on(table.eventId, table.email)
      .where(sql`${table.email} IS NOT NULL`),
    uniqueIndex('event_judges_event_id_user_id_unique')
      .on(table.eventId, table.userId)
      .where(sql`${table.userId} IS NOT NULL`),
    index('idx_event_judges_user_id').on(table.userId),
  ],
);

export const judgingVotes = pgTable(
  'judging_votes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    judgeId: uuid('judge_id')
      .notNull()
      .references(() => eventJudges.id, { onDelete: 'no action' }),
    criterionId: uuid('criterion_id')
      .notNull()
      .references(() => judgingCriteria.id, { onDelete: 'no action' }),
    winnerSubmissionId: uuid('winner_submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    loserSubmissionId: uuid('loser_submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_judging_votes_judge_id').on(table.judgeId),
    index('idx_judging_votes_criterion_id_created_at').on(
      table.criterionId,
      table.createdAt,
    ),
    index('idx_judging_votes_winner').on(table.winnerSubmissionId),
    index('idx_judging_votes_loser').on(table.loserSubmissionId),
  ],
);

export const judgeReliability = pgTable(
  'judge_reliability',
  {
    judgeId: uuid('judge_id')
      .notNull()
      .references(() => eventJudges.id, { onDelete: 'cascade' }),
    criterionId: uuid('criterion_id')
      .notNull()
      .references(() => judgingCriteria.id, { onDelete: 'cascade' }),
    alpha: doublePrecision('alpha').notNull(),
    beta: doublePrecision('beta').notNull(),
  },
  (table) => [primaryKey({ columns: [table.judgeId, table.criterionId] })],
);

export const submissionScores = pgTable(
  'submission_scores',
  {
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    criterionId: uuid('criterion_id')
      .notNull()
      .references(() => judgingCriteria.id, { onDelete: 'cascade' }),
    mu: doublePrecision('mu').notNull(),
    sigmaSq: doublePrecision('sigma_sq').notNull(),
  },
  (table) => [primaryKey({ columns: [table.submissionId, table.criterionId] })],
);

export const judgeState = pgTable(
  'judge_state',
  {
    judgeId: uuid('judge_id')
      .primaryKey()
      .references(() => eventJudges.id, { onDelete: 'cascade' }),
    /** Where the judge has been sent. Null while there's nowhere to go. */
    currentSubmissionId: uuid('current_submission_id').references(
      () => submissions.id,
      { onDelete: 'set null' },
    ),
    /** What they're comparing against. Null until they press Begin. */
    previousSubmissionId: uuid('previous_submission_id').references(
      () => submissions.id,
      { onDelete: 'set null' },
    ),
    /** When `current` was assigned — drives the busy window. */
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
  },
  (table) => [index('idx_judge_state_current').on(table.currentSubmissionId)],
);

export type JudgeSkipReason = 'not_here' | 'conflict';

export const judgeSkips = pgTable(
  'judge_skips',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    judgeId: uuid('judge_id')
      .notNull()
      .references(() => eventJudges.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    /** `not_here` may come back later; `conflict` never does. */
    reason: text('reason').$type<JudgeSkipReason>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_judge_skips_judge_id').on(table.judgeId),
    check(
      'judge_skips_reason_valid',
      sql`${table.reason} IN ('not_here', 'conflict')`,
    ),
  ],
);

export const judgeNotes = pgTable(
  'judge_notes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.submissionId] })],
);
