/**
 * Participant registration database schema
 *
 * This module defines the database tables and views for the hackathon
 * participant registration system. It includes:
 * - Main participant table (1:1 with auth users)
 * - Junction tables for many-to-many relationships
 * - Database views for efficient querying and display
 *
 * The schema is designed to normalize data and support efficient queries
 * with appropriate indexes on commonly queried columns.
 */

import {
  pgTable,
  uuid,
  boolean,
  integer,
  varchar,
  text,
  timestamp,
  pgView,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

import { user } from './auth-schema';
import {
  genders,
  universities,
  majors,
  yearsOfStudy,
  heardFromSources,
  interests,
  dietaryRestrictions,
} from './lookups';

/**
 * Participants table - stores hackathon participant information
 *
 * This table has a 1:1 relationship with the Better Auth user table.
 * Each authenticated user can have at most one participant record.
 *
 * Indexes:
 * - idx_participants_user_id_created_at: For querying participants by user and sorting by creation date
 * - idx_participants_created_at_desc: For displaying recent registrations
 */
export const participants = pgTable(
  'participants',
  {
    /** Foreign key to auth user table, serves as primary key */
    userId: uuid('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),

    /** Participant's full legal name */
    fullName: varchar('full_name', { length: 255 }).notNull(),

    /** Whether participant has attended this hackathon before */
    attendedBefore: boolean('attended_before').notNull().default(false),

    /** Foreign key to gender lookup table */
    genderId: integer('gender_id')
      .notNull()
      .references(() => genders.id),

    /** Foreign key to university lookup table */
    universityId: integer('university_id')
      .notNull()
      .references(() => universities.id),

    /** Foreign key to major/field of study lookup table */
    majorId: integer('major_id')
      .notNull()
      .references(() => majors.id),

    /** Foreign key to year of study lookup table */
    yearOfStudyId: integer('year_of_study_id')
      .notNull()
      .references(() => yearsOfStudy.id),

    /** Accessibility or special accommodation requests (free text) */
    accommodations: text('accommodations'),

    /** Whether participant needs parking at the venue */
    needsParking: boolean('needs_parking').notNull().default(false),

    /** Foreign key to heard-from source lookup table (for marketing attribution) */
    heardFromId: integer('heard_from_id')
      .notNull()
      .references(() => heardFromSources.id),

    /** Consent to use participant information for event purposes */
    consentInfoUse: boolean('consent_info_use').notNull(),

    /** Consent to share information with event sponsors */
    consentSponsorShare: boolean('consent_sponsor_share').notNull(),

    /** Consent to use photos/videos featuring the participant */
    consentMediaUse: boolean('consent_media_use').notNull(),

    /** Timestamp when registration was created */
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    idxUserCreatedAt: index('idx_participants_user_id_created_at').on(
      table.userId,
      table.createdAt.desc(),
    ),
    idxCreatedAtDesc: index('idx_participants_created_at_desc').on(
      table.createdAt.desc(),
    ),
  }),
);

/**
 * Participant interests junction table
 *
 * Many-to-many relationship between participants and interests.
 * Allows participants to select multiple interest areas (e.g., "Web Development", "AI").
 *
 * Index: idx_participant_interests_user_interest for efficient lookups
 */
export const participantInterests = pgTable(
  'participant_interests',
  {
    /** Foreign key to participant (cascading delete) */
    userId: uuid('user_id')
      .notNull()
      .references(() => participants.userId, { onDelete: 'cascade' }),

    /** Foreign key to interests lookup table */
    interestId: integer('interest_id')
      .notNull()
      .references(() => interests.id),
  },
  (table) => ({
    idxUserInterest: index('idx_participant_interests_user_interest').on(
      table.userId,
      table.interestId,
    ),
  }),
);

/**
 * Participant dietary restrictions junction table
 *
 * Many-to-many relationship between participants and dietary restrictions.
 * Allows participants to select multiple dietary needs (e.g., "Vegetarian", "Halal").
 *
 * Index: idx_participant_dietary_user_restriction for efficient lookups
 */
export const participantDietaryRestrictions = pgTable(
  'participant_dietary_restrictions',
  {
    /** Foreign key to participant (cascading delete) */
    userId: uuid('user_id')
      .notNull()
      .references(() => participants.userId, { onDelete: 'cascade' }),

    /** Foreign key to dietary restrictions lookup table */
    restrictionId: integer('restriction_id')
      .notNull()
      .references(() => dietaryRestrictions.id),
  },
  (table) => ({
    idxUserRestriction: index('idx_participant_dietary_user_restriction').on(
      table.userId,
      table.restrictionId,
    ),
  }),
);

/**
 * Drizzle ORM relations definition for participants table
 *
 * Defines:
 * - one-to-one relations to lookup tables (gender, university, etc.)
 * - one-to-many relations to junction tables (interests, dietary restrictions)
 *
 * These relations enable type-safe querying with automatic joins.
 */
export const participantsRelations = relations(
  participants,
  ({ one, many }) => ({
    user: one(user, { fields: [participants.userId], references: [user.id] }),
    gender: one(genders, {
      fields: [participants.genderId],
      references: [genders.id],
    }),
    university: one(universities, {
      fields: [participants.universityId],
      references: [universities.id],
    }),
    major: one(majors, {
      fields: [participants.majorId],
      references: [majors.id],
    }),
    yearOfStudy: one(yearsOfStudy, {
      fields: [participants.yearOfStudyId],
      references: [yearsOfStudy.id],
    }),
    heardFrom: one(heardFromSources, {
      fields: [participants.heardFromId],
      references: [heardFromSources.id],
    }),
    interests: many(participantInterests),
    dietary: many(participantDietaryRestrictions),
  }),
);

/**
 * Participant view - denormalized view for display purposes
 *
 * This database view joins participant data with lookup tables and aggregates
 * interests and dietary restrictions into arrays. Useful for displaying
 * participant information in tables and reports.
 *
 * Returns human-readable labels instead of IDs, and aggregates related data.
 */
export const participantView = pgView('participant_view', {
  userId: uuid('user_id').notNull(),
  email: text().notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  accommodations: text(),
  gender: varchar({ length: 100 }).notNull(),
  university: varchar({ length: 200 }).notNull(),
  major: varchar({ length: 150 }).notNull(),
  yearOfStudy: varchar('year_of_study', { length: 10 }).notNull(),
  heardFrom: varchar('heard_from', { length: 150 }).notNull(),
  needsParking: boolean('needs_parking').notNull(),
  attendedBefore: boolean('attended_before').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  interests: varchar(),
  dietaryRestrictions: varchar('dietary_restrictions'),
}).as(
  sql`
WITH
  dr AS (
    SELECT
      p.user_id,
      ARRAY_AGG(l.label ORDER BY l.label) AS dietary_restrictions
    FROM participant_dietary_restrictions p
    JOIN dietary_restrictions l ON l.id = p.restriction_id
    GROUP BY p.user_id
  ),
  ints AS (
    SELECT
      p.user_id,
      ARRAY_AGG(l.label ORDER BY l.label) AS interests
    FROM participant_interests p
    JOIN interests l ON l.id = p.interest_id
    GROUP BY p.user_id
  )
SELECT
  p.user_id,
  p.full_name,
  p.attended_before,
  g.label AS gender,
  u.label AS university,
  m.label AS major,
  y.label AS year_of_study,
  p.accommodations,
  p.needs_parking,
  h.label AS heard_from,
  p.consent_info_use,
  p.consent_sponsor_share,
  p.consent_media_use,
  ints.interests,
  dr.dietary_restrictions
FROM participants p
LEFT JOIN ints ON ints.user_id = p.user_id
LEFT JOIN dr   ON dr.user_id   = p.user_id
LEFT JOIN genders g ON g.id = p.gender_id
LEFT JOIN universities u ON u.id = p.university_id
LEFT JOIN majors m ON m.id = p.major_id
LEFT JOIN years_of_study y ON y.id = p.year_of_study_id
LEFT JOIN heard_from_sources h ON h.id = p.heard_from_id
`,
);

/**
 * Participant form view - structured for form population
 *
 * This database view returns participant data in a format that matches
 * the registration form schema. It aggregates interests and dietary
 * restrictions as arrays of IDs (not labels) for easy form population.
 *
 * Used by getOwnRegistration() to pre-fill the registration form when
 * a participant edits their information.
 */
export const participantFormView = pgView('participant_form_view', {
  userId: uuid('user_id').notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  attendedBefore: boolean('attended_before').notNull(),
  genderId: integer('gender_id').notNull(),
  universityId: integer('university_id').notNull(),
  majorId: integer('major_id').notNull(),
  yearOfStudyId: integer('year_of_study_id').notNull(),
  heardFromId: integer('heard_from_id').notNull(),
  needsParking: boolean('needs_parking').notNull(),
  accommodations: text().notNull(),
  consentInfoUse: boolean('consent_info_use').notNull(),
  consentSponsorShare: boolean('consent_sponsor_share').notNull(),
  consentMediaUse: boolean('consent_media_use').notNull(),
  interests: integer('interests').array().notNull(),
  dietaryRestrictions: integer('dietary_restrictions').array().notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
}).as(
  sql`
WITH
  interests AS (
    SELECT
      participant_interests.user_id,
      array_agg(DISTINCT participant_interests.interest_id) AS interests
    FROM
      participant_interests
    WHERE
      participant_interests.interest_id IS NOT NULL
    GROUP BY
      participant_interests.user_id
  ),
  dietary AS (
    SELECT
      participant_dietary_restrictions.user_id,
      array_agg(
        DISTINCT participant_dietary_restrictions.restriction_id
      ) AS dietary_restrictions
    FROM
      participant_dietary_restrictions
    WHERE
      participant_dietary_restrictions.restriction_id IS NOT NULL
    GROUP BY
      participant_dietary_restrictions.user_id
  )
SELECT
  p.user_id,
  p.full_name,
  p.attended_before,
  p.gender_id,
  p.university_id,
  p.major_id,
  p.year_of_study_id,
  p.heard_from_id,
  p.needs_parking,
  p.accommodations,
  p.consent_info_use,
  p.consent_sponsor_share,
  p.consent_media_use,
  COALESCE(i.interests, '{}'::integer[]) AS interests,
  COALESCE(d.dietary_restrictions, '{}'::integer[]) AS dietary_restrictions,
  p.created_at
FROM
  participants p
  LEFT JOIN interests i USING (user_id)
  LEFT JOIN dietary d USING (user_id)
`,
);
