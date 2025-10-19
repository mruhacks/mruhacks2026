import { relations } from "drizzle-orm/relations";
import { user, account, session, participants, genders, universities, majors, yearsOfStudy, heardFromSources, participantDietaryRestrictions, dietaryRestrictions, participantInterests, interests } from "./schema";

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	accounts: many(account),
	sessions: many(session),
	participants: many(participants),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const participantsRelations = relations(participants, ({one, many}) => ({
	user: one(user, {
		fields: [participants.userId],
		references: [user.id]
	}),
	gender: one(genders, {
		fields: [participants.genderId],
		references: [genders.id]
	}),
	university: one(universities, {
		fields: [participants.universityId],
		references: [universities.id]
	}),
	major: one(majors, {
		fields: [participants.majorId],
		references: [majors.id]
	}),
	yearsOfStudy: one(yearsOfStudy, {
		fields: [participants.yearOfStudyId],
		references: [yearsOfStudy.id]
	}),
	heardFromSource: one(heardFromSources, {
		fields: [participants.heardFromId],
		references: [heardFromSources.id]
	}),
	participantDietaryRestrictions: many(participantDietaryRestrictions),
	participantInterests: many(participantInterests),
}));

export const gendersRelations = relations(genders, ({many}) => ({
	participants: many(participants),
}));

export const universitiesRelations = relations(universities, ({many}) => ({
	participants: many(participants),
}));

export const majorsRelations = relations(majors, ({many}) => ({
	participants: many(participants),
}));

export const yearsOfStudyRelations = relations(yearsOfStudy, ({many}) => ({
	participants: many(participants),
}));

export const heardFromSourcesRelations = relations(heardFromSources, ({many}) => ({
	participants: many(participants),
}));

export const participantDietaryRestrictionsRelations = relations(participantDietaryRestrictions, ({one}) => ({
	participant: one(participants, {
		fields: [participantDietaryRestrictions.userId],
		references: [participants.userId]
	}),
	dietaryRestriction: one(dietaryRestrictions, {
		fields: [participantDietaryRestrictions.restrictionId],
		references: [dietaryRestrictions.id]
	}),
}));

export const dietaryRestrictionsRelations = relations(dietaryRestrictions, ({many}) => ({
	participantDietaryRestrictions: many(participantDietaryRestrictions),
}));

export const participantInterestsRelations = relations(participantInterests, ({one}) => ({
	participant: one(participants, {
		fields: [participantInterests.userId],
		references: [participants.userId]
	}),
	interest: one(interests, {
		fields: [participantInterests.interestId],
		references: [interests.id]
	}),
}));

export const interestsRelations = relations(interests, ({many}) => ({
	participantInterests: many(participantInterests),
}));