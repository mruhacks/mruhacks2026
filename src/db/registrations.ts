import {
  pgTable,
  uuid,
  boolean,
  integer,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
