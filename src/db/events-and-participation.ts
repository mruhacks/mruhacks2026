/**
 * Events and event participation database schema
 *
 * This module defines:
 * - events: Events (hackathon, workshops); some have applications, some don't
 * - user_profiles: Profile fields shared across event applications
 * - user_interests / user_dietary_restrictions: User-level many-to-many with lookups
 * - event_applications: Apply flow (one per user per event with has_application); minimal + responses JSONB
 * - event_attendees: Register-for-event flow (simple signup for events without application)
 * - event_articles: Per-event wiki pages authored in markdown by organizers
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
  doublePrecision,
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
    /**
     * Organizer-authored blurb shown on the participant event page, stored as
     * markdown (authored in the MDX editor). Attachments referenced from it
     * live in object storage under `event-content/`.
     */
    descriptionMarkdown: text('description_markdown'),
    hasApplication: boolean('has_application').notNull().default(false),
    // Questions are configured independently from whether an application is
    // required. An empty list is a valid application configuration.
    applicationQuestions: jsonb('application_questions')
      .$type<ApplicationQuestion[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    /** Free-text venue/location, shown on the event page and Apple Wallet pass. */
    location: text('location'),
    /**
     * Geofence center for the Apple Wallet pass's location-based relevance.
     * All three are set together or not at all (enforced in actions.ts).
     */
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    radiusMeters: integer('radius_meters'),
    capacity: integer('capacity'),
    // Marks the single event whose registerUrl the public site links to.
    isFeatured: boolean('is_featured').notNull().default(false),
    teamsEnabled: boolean('teams_enabled').notNull().default(false),
    // Nullable = uncapped team size.
    maxTeamSize: integer('max_team_size'),
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
  /** Free-text answer when dietaryRestrictions includes the "Other" option. */
  dietaryOtherText: varchar('dietary_other_text', { length: 255 }),
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

/**
 * Academic/optional profile info, split from user_profiles so the welcome
 * wizard's About step can persist independently of the Personal step: a row
 * existing here (not a nullable column on user_profiles) is what "About step
 * done" means, so no column here is ever required-but-not-yet-known.
 */
export const userProfileAbout = pgTable('user_profile_about', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
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
  /** Optional social links, shown to organizers/sponsors reviewing applications. */
  linkedinUrl: varchar('linkedin_url', { length: 255 }),
  githubUrl: varchar('github_url', { length: 255 }),
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
// Teams (event-scoped groups participants form to attend together)
// ---------------------------------------------------------------------------

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // 8-char alphanumeric join code, unique per event (not globally).
    code: varchar('code', { length: 8 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    eventCodeUnique: uniqueIndex('teams_event_id_code_unique').on(
      table.eventId,
      table.code,
    ),
    idxEventId: index('idx_teams_event_id').on(table.eventId),
  }),
);

// ---------------------------------------------------------------------------
// Team membership (a user belongs to at most one team per event)
// ---------------------------------------------------------------------------

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Denormalized for fast per-event lookups and to enforce "one active
    // team per user per event" via the unique index below.
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => ({
    userEventUnique: uniqueIndex('team_members_user_id_event_id_unique').on(
      table.userId,
      table.eventId,
    ),
    idxTeamId: index('idx_team_members_team_id').on(table.teamId),
    idxEventId: index('idx_team_members_event_id').on(table.eventId),
  }),
);

// ---------------------------------------------------------------------------
// Event articles (per-event wiki pages, authored in markdown by organizers)
// ---------------------------------------------------------------------------

export const eventArticles = pgTable(
  'event_articles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** URL segment, unique per event — articles are addressed by it, not by id. */
    slug: varchar('slug', { length: 120 }).notNull(),
    title: text('title').notNull(),
    /** Markdown body produced by the MDX editor; rendered read-only elsewhere. */
    bodyMarkdown: text('body_markdown').notNull().default(''),
    /** Drafts stay organizer-only until this flips. */
    published: boolean('published').notNull().default(false),
    /** Manual ordering within an event's wiki index; ties break on title. */
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    eventSlugUnique: uniqueIndex('event_articles_event_id_slug_unique').on(
      table.eventId,
      table.slug,
    ),
    idxEventPublished: index('idx_event_articles_event_id_published').on(
      table.eventId,
      table.published,
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
  teams: many(teams),
  teamMembers: many(teamMembers),
  articles: many(eventArticles),
}));

export const eventArticlesRelations = relations(eventArticles, ({ one }) => ({
  event: one(events, {
    fields: [eventArticles.eventId],
    references: [events.id],
  }),
  createdByUser: one(user, {
    fields: [eventArticles.createdBy],
    references: [user.id],
    relationName: 'eventArticleAuthor',
  }),
  updatedByUser: one(user, {
    fields: [eventArticles.updatedBy],
    references: [user.id],
    relationName: 'eventArticleEditor',
  }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(user, { fields: [userProfiles.userId], references: [user.id] }),
  gender: one(genders, {
    fields: [userProfiles.genderId],
    references: [genders.id],
  }),
}));

export const userProfileAboutRelations = relations(
  userProfileAbout,
  ({ one }) => ({
    user: one(user, {
      fields: [userProfileAbout.userId],
      references: [user.id],
    }),
    university: one(universities, {
      fields: [userProfileAbout.universityId],
      references: [universities.id],
    }),
    major: one(majors, {
      fields: [userProfileAbout.majorId],
      references: [majors.id],
    }),
    yearOfStudy: one(yearsOfStudy, {
      fields: [userProfileAbout.yearOfStudyId],
      references: [yearsOfStudy.id],
    }),
  }),
);

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

export const teamsRelations = relations(teams, ({ one, many }) => ({
  event: one(events, {
    fields: [teams.eventId],
    references: [events.id],
  }),
  organizer: one(user, {
    fields: [teams.organizerId],
    references: [user.id],
  }),
  members: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(user, {
    fields: [teamMembers.userId],
    references: [user.id],
  }),
  event: one(events, {
    fields: [teamMembers.eventId],
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
  pa.linkedin_url,
  pa.github_url,
  p.gender_other_text,
  pa.university_other_text,
  pa.major_other_text,
  p.dietary_other_text
FROM event_applications a
JOIN events e ON e.id = a.event_id
JOIN "user" u ON u.id = a.user_id
LEFT JOIN user_profiles p ON p.user_id = a.user_id
LEFT JOIN user_profile_about pa ON pa.user_id = a.user_id
LEFT JOIN genders g ON g.id = p.gender_id
LEFT JOIN universities un ON un.id = pa.university_id
LEFT JOIN majors m ON m.id = pa.major_id
LEFT JOIN years_of_study y ON y.id = pa.year_of_study_id
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
  pa.university_id,
  pa.major_id,
  pa.year_of_study_id,
  COALESCE(i.interests, '{}'::integer[]) AS interests,
  COALESCE(d.dietary_restrictions, '{}'::integer[]) AS dietary_restrictions,
  a.responses,
  a.created_at,
  pa.linkedin_url,
  pa.github_url,
  p.gender_other_text,
  pa.university_other_text,
  pa.major_other_text,
  p.dietary_other_text
FROM event_applications a
JOIN user_profiles p ON p.user_id = a.user_id
LEFT JOIN user_profile_about pa ON pa.user_id = a.user_id
LEFT JOIN interests_agg i ON i.user_id = a.user_id
LEFT JOIN dietary_agg d ON d.user_id = a.user_id
`,
);
