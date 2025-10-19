import {
  pgTable,
  uuid,
  boolean,
  integer,
  varchar,
  text,
  timestamp,
  pgView,
} from "drizzle-orm/pg-core";
import { eq, relations, sql } from "drizzle-orm";

import { user } from "./auth-schema";
import {
  genders,
  universities,
  majors,
  yearsOfStudy,
  heardFromSources,
  interests,
  dietaryRestrictions,
} from "./lookups";

// Participants table (1:1 with BetterAuth user)
export const participants = pgTable("participants", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),

  fullName: varchar("full_name", { length: 255 }).notNull(),
  attendedBefore: boolean("attended_before").notNull().default(false),

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

  accommodations: text("accommodations"),

  needsParking: boolean("needs_parking").notNull().default(false),
  heardFromId: integer("heard_from_id")
    .notNull()
    .references(() => heardFromSources.id),

  consentInfoUse: boolean("consent_info_use").notNull(),
  consentSponsorShare: boolean("consent_sponsor_share").notNull(),
  consentMediaUse: boolean("consent_media_use").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Junction: participant ↔ interests
export const participantInterests = pgTable("participant_interests", {
  userId: uuid("user_id")
    .notNull()
    .references(() => participants.userId, { onDelete: "cascade" }),
  interestId: integer("interest_id")
    .notNull()
    .references(() => interests.id),
});

// Junction: participant ↔ dietary restrictions
export const participantDietaryRestrictions = pgTable(
  "participant_dietary_restrictions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => participants.userId, { onDelete: "cascade" }),
    restrictionId: integer("restriction_id")
      .notNull()
      .references(() => dietaryRestrictions.id),
  },
);

// Relations
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

export const participantView = pgView("participant_view", {
  userId: uuid("user_id"),
  email: text(),
  fullName: varchar("full_name", { length: 255 }),
  gender: varchar({ length: 100 }),
  university: varchar({ length: 200 }),
  major: varchar({ length: 150 }),
  yearOfStudy: varchar("year_of_study", { length: 10 }),
  heardFrom: varchar("heard_from", { length: 150 }),
  needsParking: boolean("needs_parking"),
  attendedBefore: boolean("attended_before"),
  createdAt: timestamp("created_at", { mode: "string" }),
  interests: varchar(),
  dietaryRestrictions: varchar("dietary_restrictions"),
}).as(
  sql`SELECT p.user_id, u.email, p.full_name, g.label AS gender, un.label AS university, m.label AS major, y.label AS year_of_study, h.label AS heard_from, p.needs_parking, p.attended_before, p.created_at, COALESCE(array_agg(DISTINCT i.label) FILTER (WHERE i.label IS NOT NULL), ARRAY[]::text[]::character varying[]) AS interests, COALESCE(array_agg(DISTINCT d.label) FILTER (WHERE d.label IS NOT NULL), ARRAY[]::text[]::character varying[]) AS dietary_restrictions FROM participants p JOIN "user" u ON u.id = p.user_id LEFT JOIN genders g ON g.id = p.gender_id LEFT JOIN universities un ON un.id = p.university_id LEFT JOIN majors m ON m.id = p.major_id LEFT JOIN years_of_study y ON y.id = p.year_of_study_id LEFT JOIN heard_from_sources h ON h.id = p.heard_from_id LEFT JOIN participant_interests pi ON pi.user_id = p.user_id LEFT JOIN interests i ON i.id = pi.interest_id LEFT JOIN participant_dietary_restrictions pd ON pd.user_id = p.user_id LEFT JOIN dietary_restrictions d ON d.id = pd.restriction_id GROUP BY p.user_id, u.email, p.full_name, g.label, un.label, m.label, y.label, h.label, p.needs_parking, p.attended_before, p.created_at ORDER BY p.created_at DESC`,
);
