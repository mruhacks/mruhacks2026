/**
 * Events and event participation database schema
 *
 * This module defines:
 * - events: Events (hackathon, workshops); some have applications, some don't
 * - user_profiles: Profile fields shared across event applications
 * - user_interests / user_dietary_restrictions: User-level many-to-many with lookups
 * - event_applications: Apply flow (one per user per event with has_application); minimal + responses JSONB
 * - event_attendees: Register-for-event flow (simple signup for events without application)
 * - application_view / application_form_view: Denormalized views for display and form pre-fill
 *
 * Event participation: events with application use event_applications; events without use event_attendees (we call the latter "register for event").
 */

import {
  pgTable,
  uuid,
  boolean,
  integer,
  smallint,
  varchar,
  text,
  timestamp,
  pgView,
  index,
  jsonb,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

import type { ApplicationQuestion } from '@/types/application';
import { user } from './auth-schema';
import {
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
  applicationStatuses,
  rsvpStatuses,
  eventTypes,
} from './lookups';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

// Self-reference (parentEventId) causes TS to infer 'any'; table is valid at runtime.
export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-ref
    parentEventId: uuid('parent_event_id').references((): any => events.id, {
      onDelete: 'set null',
    }),
    eventTypeId: integer('event_type_id').references(() => eventTypes.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    hasApplication: boolean('has_application').notNull().default(false),
    // Questions are configured independently from whether an application is
    // required. An empty list is a valid application configuration.
    applicationQuestions: jsonb('application_questions')
      .$type<ApplicationQuestion[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    capacity: integer('capacity'),
    // Marks the single event whose registerUrl the public site links to.
    isFeatured: boolean('is_featured').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    idxHasApplication: index('idx_events_has_application').on(
      table.hasApplication,
    ),
    idxFeaturedUnique: uniqueIndex('idx_events_featured_unique')
      .on(table.isFeatured)
      .where(sql`${table.isFeatured} = true`),
  }),
);

// ---------------------------------------------------------------------------
// User profiles (1:1 with user)
// ---------------------------------------------------------------------------

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  genderId: integer('gender_id')
    .notNull()
    .references(() => genders.id),
  /** Free-text answer when genderId points at the "Other" option. */
  genderOtherText: varchar('gender_other_text', { length: 255 }),
  universityId: integer('university_id')
    .notNull()
    .references(() => universities.id),
  /** Free-text answer when universityId points at the "Other" option. */
  universityOtherText: varchar('university_other_text', { length: 255 }),
  majorId: integer('major_id')
    .notNull()
    .references(() => majors.id),
  /** Free-text answer when majorId points at the "Other" option. */
  majorOtherText: varchar('major_other_text', { length: 255 }),
  yearOfStudyId: integer('year_of_study_id')
    .notNull()
    .references(() => yearsOfStudy.id),
  attendedHackathonBefore: boolean('attended_hackathon_before')
    .notNull()
    .default(false),
  /** Free-text answer when dietaryRestrictions includes the "Other" option. */
  dietaryOtherText: varchar('dietary_other_text', { length: 255 }),
  /** Optional social links, shown to organizers/sponsors reviewing applications. */
  linkedinUrl: varchar('linkedin_url', { length: 255 }),
  githubUrl: varchar('github_url', { length: 255 }),
  /** Optional resume, stored as a validated data URL with its original name. */
  resumeFile: text('resume_file'),
  resumeFileName: varchar('resume_file_name', { length: 255 }),
  resumeFileType: varchar('resume_file_type', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ---------------------------------------------------------------------------
// Event applications (one per user per event; responses = JSONB)
// ---------------------------------------------------------------------------

export const eventApplications = pgTable(
  'event_applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    statusId: integer('status_id').references(() => applicationStatuses.id),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: uuid('reviewed_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    waitlistPosition: integer('waitlist_position'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    responses: jsonb('responses').$type<Record<string, unknown>>(),
  },
  (table) => ({
    eventUserUnique: uniqueIndex(
      'event_applications_event_id_user_id_unique',
    ).on(table.eventId, table.userId),
    idxEventCreatedAt: index('idx_event_applications_event_id_created_at').on(
      table.eventId,
      table.createdAt.desc(),
    ),
    idxUserId: index('idx_event_applications_user_id').on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// User event interest ()
// ---------------------------------------------------------------------------

export const eventInterestRegistrations = pgTable(
  'event_interest_registrations',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    eventUserUnique: uniqueIndex(
      'event_interest_registrations_user_id_event_id_unique',
    ).on(table.userId, table.eventId),
  }),
);

// ---------------------------------------------------------------------------
// User interests (user-level)
// ---------------------------------------------------------------------------

export const userInterests = pgTable(
  'user_interests',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    interestId: integer('interest_id')
      .notNull()
      .references(() => interests.id),
  },
  (table) => ({
    idxUserInterest: uniqueIndex(
      'user_interests_user_id_interest_id_unique',
    ).on(table.userId, table.interestId),
  }),
);

// ---------------------------------------------------------------------------
// User dietary restrictions (user-level)
// ---------------------------------------------------------------------------

export const userDietaryRestrictions = pgTable(
  'user_dietary_restrictions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    restrictionId: integer('restriction_id')
      .notNull()
      .references(() => dietaryRestrictions.id),
  },
  (table) => ({
    idxUserRestriction: uniqueIndex(
      'user_dietary_restrictions_user_id_restriction_id_unique',
    ).on(table.userId, table.restrictionId),
  }),
);

// ---------------------------------------------------------------------------
// Event attendees (simple signup for events without application)
// ---------------------------------------------------------------------------

export const eventAttendees = pgTable(
  'event_attendees',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    registeredAt: timestamp('registered_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.userId] }),
  }),
);

// ---------------------------------------------------------------------------
// Check-ins (one row per user per event: door check-in or meal check-in)
// ---------------------------------------------------------------------------

export const checkIns = pgTable(
  'check_ins',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    checkedInAt: timestamp('checked_in_at').defaultNow().notNull(),
  },
  (table) => ({
    userEventUnique: uniqueIndex('check_ins_user_id_event_id_unique').on(
      table.userId,
      table.eventId,
    ),
    idxEventCheckedInAt: index('idx_check_ins_event_id_checked_in_at').on(
      table.eventId,
      table.checkedInAt,
    ),
    idxUserId: index('idx_check_ins_user_id').on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// Event RSVP waves (one row per wave per event; deadline = respond_by)
// ---------------------------------------------------------------------------

export const eventRsvpWaves = pgTable(
  'event_rsvp_waves',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    wave: smallint('wave').notNull(),
    respondBy: timestamp('respond_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    eventWaveUnique: uniqueIndex('event_rsvp_waves_event_id_wave_unique').on(
      table.eventId,
      table.wave,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Event RSVP responses (one row per user per wave)
// ---------------------------------------------------------------------------

export const eventRsvpResponses = pgTable(
  'event_rsvp_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rsvpWaveId: uuid('rsvp_wave_id')
      .notNull()
      .references(() => eventRsvpWaves.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    statusId: integer('status_id').references(() => rsvpStatuses.id),
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    waveUserUnique: uniqueIndex(
      'event_rsvp_responses_rsvp_wave_id_user_id_unique',
    ).on(table.rsvpWaveId, table.userId),
  }),
);

// ---------------------------------------------------------------------------
// Groups (event hosts groups)
// ---------------------------------------------------------------------------

export const groups = pgTable('groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ---------------------------------------------------------------------------
// Group membership (groups contain users)
// ---------------------------------------------------------------------------

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.userId] }),
  }),
);

// ---------------------------------------------------------------------------
// Submissions (groups submit to events)
// ---------------------------------------------------------------------------

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  },
  (table) => ({
    groupEventUnique: uniqueIndex('submissions_group_id_event_id_unique').on(
      table.groupId,
      table.eventId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const eventsRelations = relations(events, ({ one, many }) => ({
  parent: one(events, {
    fields: [events.parentEventId],
    references: [events.id],
    relationName: 'eventChildren',
  }),
  children: many(events, { relationName: 'eventChildren' }),
  eventType: one(eventTypes, {
    fields: [events.eventTypeId],
    references: [eventTypes.id],
  }),
  applications: many(eventApplications),
  attendees: many(eventAttendees),
  checkIns: many(checkIns),
  rsvpWaves: many(eventRsvpWaves),
  groups: many(groups),
  submissions: many(submissions),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(user, { fields: [userProfiles.userId], references: [user.id] }),
  gender: one(genders, {
    fields: [userProfiles.genderId],
    references: [genders.id],
  }),
  university: one(universities, {
    fields: [userProfiles.universityId],
    references: [universities.id],
  }),
  major: one(majors, {
    fields: [userProfiles.majorId],
    references: [majors.id],
  }),
  yearOfStudy: one(yearsOfStudy, {
    fields: [userProfiles.yearOfStudyId],
    references: [yearsOfStudy.id],
  }),
}));

export const eventApplicationsRelations = relations(
  eventApplications,
  ({ one }) => ({
    event: one(events, {
      fields: [eventApplications.eventId],
      references: [events.id],
    }),
    user: one(user, {
      fields: [eventApplications.userId],
      references: [user.id],
    }),
    status: one(applicationStatuses, {
      fields: [eventApplications.statusId],
      references: [applicationStatuses.id],
    }),
  }),
);

export const userInterestsRelations = relations(userInterests, ({ one }) => ({
  user: one(user, { fields: [userInterests.userId], references: [user.id] }),
  interest: one(interests, {
    fields: [userInterests.interestId],
    references: [interests.id],
  }),
}));

export const userDietaryRestrictionsRelations = relations(
  userDietaryRestrictions,
  ({ one }) => ({
    user: one(user, {
      fields: [userDietaryRestrictions.userId],
      references: [user.id],
    }),
    restriction: one(dietaryRestrictions, {
      fields: [userDietaryRestrictions.restrictionId],
      references: [dietaryRestrictions.id],
    }),
  }),
);

export const eventAttendeesRelations = relations(eventAttendees, ({ one }) => ({
  event: one(events, {
    fields: [eventAttendees.eventId],
    references: [events.id],
  }),
  user: one(user, {
    fields: [eventAttendees.userId],
    references: [user.id],
  }),
}));

export const checkInsRelations = relations(checkIns, ({ one }) => ({
  event: one(events, {
    fields: [checkIns.eventId],
    references: [events.id],
  }),
  user: one(user, {
    fields: [checkIns.userId],
    references: [user.id],
  }),
}));

export const eventRsvpWavesRelations = relations(
  eventRsvpWaves,
  ({ one, many }) => ({
    event: one(events, {
      fields: [eventRsvpWaves.eventId],
      references: [events.id],
    }),
    responses: many(eventRsvpResponses),
  }),
);

export const eventRsvpResponsesRelations = relations(
  eventRsvpResponses,
  ({ one }) => ({
    rsvpWave: one(eventRsvpWaves, {
      fields: [eventRsvpResponses.rsvpWaveId],
      references: [eventRsvpWaves.id],
    }),
    user: one(user, {
      fields: [eventRsvpResponses.userId],
      references: [user.id],
    }),
    status: one(rsvpStatuses, {
      fields: [eventRsvpResponses.statusId],
      references: [rsvpStatuses.id],
    }),
  }),
);

export const groupsRelations = relations(groups, ({ one, many }) => ({
  event: one(events, {
    fields: [groups.eventId],
    references: [events.id],
  }),
  members: many(groupMembers),
  submissions: many(submissions),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  user: one(user, {
    fields: [groupMembers.userId],
    references: [user.id],
  }),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  group: one(groups, {
    fields: [submissions.groupId],
    references: [groups.id],
  }),
  event: one(events, {
    fields: [submissions.eventId],
    references: [events.id],
  }),
}));

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/**
 * Application view - denormalized for display (profile + event + user + responses)
 */
export const applicationView = pgView('application_view', {
  eventId: uuid('event_id').notNull(),
  eventName: text('event_name').notNull(),
  userId: uuid('user_id').notNull(),
  email: text('email').notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  gender: varchar({ length: 100 }).notNull(),
  university: varchar({ length: 200 }).notNull(),
  major: varchar({ length: 150 }).notNull(),
  yearOfStudy: varchar('year_of_study', { length: 10 }).notNull(),
  interests: text().array(),
  dietaryRestrictions: text('dietary_restrictions').array(),
  responses: jsonb('responses').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  linkedinUrl: varchar('linkedin_url', { length: 255 }),
  githubUrl: varchar('github_url', { length: 255 }),
  genderOtherText: varchar('gender_other_text', { length: 255 }),
  universityOtherText: varchar('university_other_text', { length: 255 }),
  majorOtherText: varchar('major_other_text', { length: 255 }),
  dietaryOtherText: varchar('dietary_other_text', { length: 255 }),
}).as(
  sql`
WITH
  dr AS (
    SELECT
      u.user_id,
      ARRAY_AGG(l.label ORDER BY l.label) AS dietary_restrictions
    FROM user_dietary_restrictions u
    JOIN dietary_restrictions l ON l.id = u.restriction_id
    GROUP BY u.user_id
  ),
  ints AS (
    SELECT
      u.user_id,
      ARRAY_AGG(l.label ORDER BY l.label) AS interests
    FROM user_interests u
    JOIN interests l ON l.id = u.interest_id
    GROUP BY u.user_id
  )
SELECT
  a.event_id,
  e.name AS event_name,
  a.user_id,
  u.email,
  p.full_name,
  g.label AS gender,
  un.label AS university,
  m.label AS major,
  y.label AS year_of_study,
  ints.interests,
  dr.dietary_restrictions,
  a.responses,
  a.created_at,
  p.linkedin_url,
  p.github_url,
  p.gender_other_text,
  p.university_other_text,
  p.major_other_text,
  p.dietary_other_text
FROM event_applications a
JOIN events e ON e.id = a.event_id
JOIN "user" u ON u.id = a.user_id
LEFT JOIN user_profiles p ON p.user_id = a.user_id
LEFT JOIN genders g ON g.id = p.gender_id
LEFT JOIN universities un ON un.id = p.university_id
LEFT JOIN majors m ON m.id = p.major_id
LEFT JOIN years_of_study y ON y.id = p.year_of_study_id
LEFT JOIN ints ON ints.user_id = a.user_id
LEFT JOIN dr ON dr.user_id = a.user_id
`,
);

/**
 * Application form view - for form pre-fill (profile IDs + interests/dietary arrays + responses)
 */
export const applicationFormView = pgView('application_form_view', {
  eventId: uuid('event_id').notNull(),
  userId: uuid('user_id').notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  genderId: integer('gender_id').notNull(),
  universityId: integer('university_id').notNull(),
  majorId: integer('major_id').notNull(),
  yearOfStudyId: integer('year_of_study_id').notNull(),
  interests: integer('interests').array().notNull(),
  dietaryRestrictions: integer('dietary_restrictions').array().notNull(),
  responses: jsonb('responses').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  linkedinUrl: varchar('linkedin_url', { length: 255 }),
  githubUrl: varchar('github_url', { length: 255 }),
  genderOtherText: varchar('gender_other_text', { length: 255 }),
  universityOtherText: varchar('university_other_text', { length: 255 }),
  majorOtherText: varchar('major_other_text', { length: 255 }),
  dietaryOtherText: varchar('dietary_other_text', { length: 255 }),
}).as(
  sql`
WITH
  interests_agg AS (
    SELECT
      user_id,
      array_agg(DISTINCT interest_id) AS interests
    FROM user_interests
    WHERE interest_id IS NOT NULL
    GROUP BY user_id
  ),
  dietary_agg AS (
    SELECT
      user_id,
      array_agg(DISTINCT restriction_id) AS dietary_restrictions
    FROM user_dietary_restrictions
    WHERE restriction_id IS NOT NULL
    GROUP BY user_id
  )
SELECT
  a.event_id,
  a.user_id,
  p.full_name,
  p.gender_id,
  p.university_id,
  p.major_id,
  p.year_of_study_id,
  COALESCE(i.interests, '{}'::integer[]) AS interests,
  COALESCE(d.dietary_restrictions, '{}'::integer[]) AS dietary_restrictions,
  a.responses,
  a.created_at,
  p.linkedin_url,
  p.github_url,
  p.gender_other_text,
  p.university_other_text,
  p.major_other_text,
  p.dietary_other_text
FROM event_applications a
JOIN user_profiles p ON p.user_id = a.user_id
LEFT JOIN interests_agg i ON i.user_id = a.user_id
LEFT JOIN dietary_agg d ON d.user_id = a.user_id
`,
);
