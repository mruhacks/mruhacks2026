import {
  pgTable,
  serial,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ──────────────────────────────
// Lookup Tables
// ──────────────────────────────

// Gender lookup (could be replaced with enum if truly fixed)
export const genders = pgTable("genders", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 50 }).unique().notNull(),
});

// Universities lookup
export const universities = pgTable("universities", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).unique().notNull(),
});

// Majors lookup
export const majors = pgTable("majors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).unique().notNull(),
});

// Year of study lookup
export const yearsOfStudy = pgTable("years_of_study", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 10 }).unique().notNull(),
});

// “How did you hear about us?” lookup
export const heardFromSources = pgTable("heard_from_sources", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 100 }).unique().notNull(),
});

// Interests lookup
export const interests = pgTable("interests", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).unique().notNull(),
});

// Dietary restrictions lookup
export const dietaryRestrictions = pgTable("dietary_restrictions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).unique().notNull(),
});

// ──────────────────────────────
// Core Tables
// ──────────────────────────────

// Participants
export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Many-to-many: participant ↔ interests
export const participantInterests = pgTable(
  "participant_interests",
  {
    participantId: integer("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    interestId: integer("interest_id")
      .notNull()
      .references(() => interests.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.participantId, t.interestId] }),
  }),
);

// Many-to-many: participant ↔ dietary restrictions
export const participantDietaryRestrictions = pgTable(
  "participant_dietary_restrictions",
  {
    participantId: integer("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    restrictionId: integer("restriction_id")
      .notNull()
      .references(() => dietaryRestrictions.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.participantId, t.restrictionId] }),
  }),
);

// Consents (1:1)
export const consents = pgTable("consents", {
  participantId: integer("participant_id")
    .primaryKey()
    .references(() => participants.id, { onDelete: "cascade" }),

  needsParking: boolean("needs_parking").notNull(),
  heardFromId: integer("heard_from_id")
    .notNull()
    .references(() => heardFromSources.id),

  consentInfoUse: boolean("consent_info_use").notNull(),
  consentSponsorShare: boolean("consent_sponsor_share").notNull(),
  consentMediaUse: boolean("consent_media_use").notNull(),
});

export const participantsRelations = relations(
  participants,
  ({ one, many }) => ({
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
    consents: one(consents, {
      fields: [participants.id],
      references: [consents.participantId],
    }),
    interests: many(participantInterests),
    dietaryRestrictions: many(participantDietaryRestrictions),
  }),
);
