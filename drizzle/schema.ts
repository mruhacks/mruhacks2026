import { pgTable, uuid, text, timestamp, unique, boolean, foreignKey, index, varchar, integer, serial, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const verification = pgTable("verification", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const user = pgTable("user", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("user_email_unique").on(table.email),
]);

export const account = pgTable("account", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").defaultRandom().notNull(),
	providerId: text("provider_id").notNull(),
	userId: uuid("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	scope: text(),
	password: text(),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const session = pgTable("session", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	token: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	userId: uuid("user_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("session_token_unique").on(table.token),
]);

export const participants = pgTable("participants", {
	userId: uuid("user_id").primaryKey().notNull(),
	fullName: varchar("full_name", { length: 255 }).notNull(),
	attendedBefore: boolean("attended_before").default(false).notNull(),
	genderId: integer("gender_id").notNull(),
	universityId: integer("university_id").notNull(),
	majorId: integer("major_id").notNull(),
	yearOfStudyId: integer("year_of_study_id").notNull(),
	accommodations: text(),
	needsParking: boolean("needs_parking").default(false).notNull(),
	heardFromId: integer("heard_from_id").notNull(),
	consentInfoUse: boolean("consent_info_use").notNull(),
	consentSponsorShare: boolean("consent_sponsor_share").notNull(),
	consentMediaUse: boolean("consent_media_use").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_participants_created_at_desc").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("idx_participants_user_id_created_at").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "participants_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.genderId],
			foreignColumns: [genders.id],
			name: "participants_gender_id_genders_id_fk"
		}),
	foreignKey({
			columns: [table.universityId],
			foreignColumns: [universities.id],
			name: "participants_university_id_universities_id_fk"
		}),
	foreignKey({
			columns: [table.majorId],
			foreignColumns: [majors.id],
			name: "participants_major_id_majors_id_fk"
		}),
	foreignKey({
			columns: [table.yearOfStudyId],
			foreignColumns: [yearsOfStudy.id],
			name: "participants_year_of_study_id_years_of_study_id_fk"
		}),
	foreignKey({
			columns: [table.heardFromId],
			foreignColumns: [heardFromSources.id],
			name: "participants_heard_from_id_heard_from_sources_id_fk"
		}),
]);

export const participantDietaryRestrictions = pgTable("participant_dietary_restrictions", {
	userId: uuid("user_id").notNull(),
	restrictionId: integer("restriction_id").notNull(),
}, (table) => [
	index("idx_participant_dietary_user_id").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.restrictionId.asc().nullsLast().op("int4_ops")),
	index("idx_participant_dietary_user_restriction").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.restrictionId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [participants.userId],
			name: "participant_dietary_restrictions_user_id_participants_user_id_f"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.restrictionId],
			foreignColumns: [dietaryRestrictions.id],
			name: "participant_dietary_restrictions_restriction_id_dietary_restric"
		}),
]);

export const dietaryRestrictions = pgTable("dietary_restrictions", {
	id: serial().primaryKey().notNull(),
	label: varchar({ length: 150 }).notNull(),
}, (table) => [
	unique("dietary_restrictions_label_unique").on(table.label),
]);

export const participantInterests = pgTable("participant_interests", {
	userId: uuid("user_id").notNull(),
	interestId: integer("interest_id").notNull(),
}, (table) => [
	index("idx_participant_interests_user_id").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.interestId.asc().nullsLast().op("int4_ops")),
	index("idx_participant_interests_user_interest").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.interestId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [participants.userId],
			name: "participant_interests_user_id_participants_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.interestId],
			foreignColumns: [interests.id],
			name: "participant_interests_interest_id_interests_id_fk"
		}),
]);

export const interests = pgTable("interests", {
	id: serial().primaryKey().notNull(),
	label: varchar({ length: 150 }).notNull(),
}, (table) => [
	unique("interests_label_unique").on(table.label),
]);

export const genders = pgTable("genders", {
	id: serial().primaryKey().notNull(),
	label: varchar({ length: 100 }).notNull(),
}, (table) => [
	unique("genders_label_unique").on(table.label),
]);

export const universities = pgTable("universities", {
	id: serial().primaryKey().notNull(),
	label: varchar({ length: 200 }).notNull(),
}, (table) => [
	unique("universities_label_unique").on(table.label),
]);

export const majors = pgTable("majors", {
	id: serial().primaryKey().notNull(),
	label: varchar({ length: 150 }).notNull(),
}, (table) => [
	unique("majors_label_unique").on(table.label),
]);

export const yearsOfStudy = pgTable("years_of_study", {
	id: serial().primaryKey().notNull(),
	label: varchar({ length: 10 }).notNull(),
}, (table) => [
	unique("years_of_study_label_unique").on(table.label),
]);

export const heardFromSources = pgTable("heard_from_sources", {
	id: serial().primaryKey().notNull(),
	label: varchar({ length: 150 }).notNull(),
}, (table) => [
	unique("heard_from_sources_label_unique").on(table.label),
]);
export const participantView = pgView("participant_view", {	userId: uuid("user_id"),
	email: text(),
	fullName: varchar("full_name", { length: 255 }),
	gender: varchar({ length: 100 }),
	university: varchar({ length: 200 }),
	major: varchar({ length: 150 }),
	yearOfStudy: varchar("year_of_study", { length: 10 }),
	heardFrom: varchar("heard_from", { length: 150 }),
	needsParking: boolean("needs_parking"),
	attendedBefore: boolean("attended_before"),
	createdAt: timestamp("created_at", { mode: 'string' }),
	interests: varchar(),
	dietaryRestrictions: varchar("dietary_restrictions"),
}).as(sql`SELECT p.user_id, u.email, p.full_name, g.label AS gender, un.label AS university, m.label AS major, y.label AS year_of_study, h.label AS heard_from, p.needs_parking, p.attended_before, p.created_at, COALESCE(array_agg(DISTINCT i.label) FILTER (WHERE i.label IS NOT NULL), ARRAY[]::text[]::character varying[]) AS interests, COALESCE(array_agg(DISTINCT d.label) FILTER (WHERE d.label IS NOT NULL), ARRAY[]::text[]::character varying[]) AS dietary_restrictions FROM participants p JOIN "user" u ON u.id = p.user_id LEFT JOIN genders g ON g.id = p.gender_id LEFT JOIN universities un ON un.id = p.university_id LEFT JOIN majors m ON m.id = p.major_id LEFT JOIN years_of_study y ON y.id = p.year_of_study_id LEFT JOIN heard_from_sources h ON h.id = p.heard_from_id LEFT JOIN participant_interests pi ON pi.user_id = p.user_id LEFT JOIN interests i ON i.id = pi.interest_id LEFT JOIN participant_dietary_restrictions pd ON pd.user_id = p.user_id LEFT JOIN dietary_restrictions d ON d.id = pd.restriction_id GROUP BY p.user_id, u.email, p.full_name, g.label, un.label, m.label, y.label, h.label, p.needs_parking, p.attended_before, p.created_at ORDER BY p.created_at DESC`);

export const participantFormView = pgView("participant_form_view", {	userId: uuid("user_id"),
	fullName: varchar("full_name", { length: 255 }),
	attendedBefore: boolean("attended_before"),
	genderId: integer("gender_id"),
	universityId: integer("university_id"),
	majorId: integer("major_id"),
	yearOfStudyId: integer("year_of_study_id"),
	heardFromId: integer("heard_from_id"),
	needsParking: boolean("needs_parking"),
	accommodations: text(),
	consentInfoUse: boolean("consent_info_use"),
	consentSponsorShare: boolean("consent_sponsor_share"),
	consentMediaUse: boolean("consent_media_use"),
	interests: integer(),
	dietaryRestrictions: integer("dietary_restrictions"),
	createdAt: timestamp("created_at", { mode: 'string' }),
}).as(sql`WITH interests AS ( SELECT participant_interests.user_id, array_agg(DISTINCT participant_interests.interest_id) AS interests FROM participant_interests WHERE participant_interests.interest_id IS NOT NULL GROUP BY participant_interests.user_id ), dietary AS ( SELECT participant_dietary_restrictions.user_id, array_agg(DISTINCT participant_dietary_restrictions.restriction_id) AS dietary_restrictions FROM participant_dietary_restrictions WHERE participant_dietary_restrictions.restriction_id IS NOT NULL GROUP BY participant_dietary_restrictions.user_id ) SELECT p.user_id, p.full_name, p.attended_before, p.gender_id, p.university_id, p.major_id, p.year_of_study_id, p.heard_from_id, p.needs_parking, p.accommodations, p.consent_info_use, p.consent_sponsor_share, p.consent_media_use, COALESCE(i.interests, '{}'::integer[]) AS interests, COALESCE(d.dietary_restrictions, '{}'::integer[]) AS dietary_restrictions, p.created_at FROM participants p LEFT JOIN interests i USING (user_id) LEFT JOIN dietary d USING (user_id)`);