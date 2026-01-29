/**
 * Events and event applications database schema
 *
 * This module defines:
 * - events: Events (hackathon, workshops); some have applications, some don't
 * - user_profiles: Profile fields shared across applications (full name, gender, university, major, year of study)
 * - user_interests / user_dietary_restrictions: User-level many-to-many with lookups
 * - event_applications: One per user per event (has_application); minimal + responses JSONB
 * - event_attendees: Simple signup for events without applications
 * - application_view / application_form_view: Denormalized views for display and form pre-fill
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
  jsonb,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

import type { ApplicationQuestion } from "@/types/application";
import { user } from "./auth-schema";
import {
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
} from "./lookups";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    hasApplication: boolean("has_application").notNull().default(false),
    applicationQuestions: jsonb("application_questions").$type<
      ApplicationQuestion[] | null
    >(),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    idxHasApplication: index("idx_events_has_application").on(
      table.hasApplication,
    ),
  }),
);

// ---------------------------------------------------------------------------
// User profiles (1:1 with user)
// ---------------------------------------------------------------------------

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  genderId: integer("gender_id")
    .notNull()
    .references(() => genders.id),
  universityId: integer("university_id")
    .notNull()
    .references(() => universities.id),
  majorId: integer("major_id")
    .notNull()
    .references(() => majors.id),
  yearOfStudyId: integer("year_of_study_id")
    .notNull()
    .references(() => yearsOfStudy.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ---------------------------------------------------------------------------
// Event applications (one per user per event; responses = JSONB)
// ---------------------------------------------------------------------------

export const eventApplications = pgTable(
  "event_applications",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    responses: jsonb("responses").$type<Record<string, unknown>>(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.userId] }),
    idxEventCreatedAt: index("idx_event_applications_event_id_created_at").on(
      table.eventId,
      table.createdAt.desc(),
    ),
    idxUserId: index("idx_event_applications_user_id").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// User interests (user-level)
// ---------------------------------------------------------------------------

export const userInterests = pgTable(
  "user_interests",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    interestId: integer("interest_id")
      .notNull()
      .references(() => interests.id),
  },
  (table) => ({
    idxUserInterest: uniqueIndex("user_interests_user_id_interest_id_unique").on(
      table.userId,
      table.interestId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// User dietary restrictions (user-level)
// ---------------------------------------------------------------------------

export const userDietaryRestrictions = pgTable(
  "user_dietary_restrictions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    restrictionId: integer("restriction_id")
      .notNull()
      .references(() => dietaryRestrictions.id),
  },
  (table) => ({
    idxUserRestriction: uniqueIndex(
      "user_dietary_restrictions_user_id_restriction_id_unique",
    ).on(table.userId, table.restrictionId),
  }),
);

// ---------------------------------------------------------------------------
// Event attendees (simple signup for events without application)
// ---------------------------------------------------------------------------

export const eventAttendees = pgTable(
  "event_attendees",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    registeredAt: timestamp("registered_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.userId] }),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const eventsRelations = relations(events, ({ many }) => ({
  applications: many(eventApplications),
  attendees: many(eventAttendees),
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

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/**
 * Application view - denormalized for display (profile + event + user + responses)
 */
export const applicationView = pgView("application_view", {
  eventId: uuid("event_id").notNull(),
  eventName: text("event_name").notNull(),
  userId: uuid("user_id").notNull(),
  email: text("email").notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  gender: varchar({ length: 100 }).notNull(),
  university: varchar({ length: 200 }).notNull(),
  major: varchar({ length: 150 }).notNull(),
  yearOfStudy: varchar("year_of_study", { length: 10 }).notNull(),
  interests: text(),
  dietaryRestrictions: text("dietary_restrictions"),
  responses: jsonb("responses").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull(),
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
  a.created_at
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
export const applicationFormView = pgView("application_form_view", {
  eventId: uuid("event_id").notNull(),
  userId: uuid("user_id").notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  genderId: integer("gender_id").notNull(),
  universityId: integer("university_id").notNull(),
  majorId: integer("major_id").notNull(),
  yearOfStudyId: integer("year_of_study_id").notNull(),
  interests: integer("interests").array().notNull(),
  dietaryRestrictions: integer("dietary_restrictions").array().notNull(),
  responses: jsonb("responses").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull(),
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
  a.created_at
FROM event_applications a
JOIN user_profiles p ON p.user_id = a.user_id
LEFT JOIN interests_agg i ON i.user_id = a.user_id
LEFT JOIN dietary_agg d ON d.user_id = a.user_id
`,
);
