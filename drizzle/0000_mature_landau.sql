CREATE SCHEMA "authz";
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"scope" text,
	"password" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_dietary_restrictions" (
	"user_id" uuid NOT NULL,
	"restriction_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_interests" (
	"user_id" uuid NOT NULL,
	"interest_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"attended_before" boolean DEFAULT false NOT NULL,
	"gender_id" integer NOT NULL,
	"university_id" integer NOT NULL,
	"major_id" integer NOT NULL,
	"year_of_study_id" integer NOT NULL,
	"accommodations" text,
	"needs_parking" boolean DEFAULT false NOT NULL,
	"heard_from_id" integer NOT NULL,
	"consent_info_use" boolean NOT NULL,
	"consent_sponsor_share" boolean NOT NULL,
	"consent_media_use" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dietary_restrictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(150) NOT NULL,
	CONSTRAINT "dietary_restrictions_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "genders" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(100) NOT NULL,
	CONSTRAINT "genders_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "heard_from_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(150) NOT NULL,
	CONSTRAINT "heard_from_sources_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(150) NOT NULL,
	CONSTRAINT "interests_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "majors" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(150) NOT NULL,
	CONSTRAINT "majors_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "universities" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(200) NOT NULL,
	CONSTRAINT "universities_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "years_of_study" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(10) NOT NULL,
	CONSTRAINT "years_of_study_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "authz"."permission" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	CONSTRAINT "permission_slug_unique" UNIQUE("slug"),
	CONSTRAINT "lower_slug" CHECK ("authz"."permission"."slug" = lower("authz"."permission"."slug"))
);
--> statement-breakpoint
CREATE TABLE "authz"."role" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text,
	"description" text,
	CONSTRAINT "role_slug_unique" UNIQUE("slug"),
	CONSTRAINT "lower_slug" CHECK ("authz"."role"."slug" = lower("authz"."role"."slug"))
);
--> statement-breakpoint
CREATE TABLE "authz"."role_permission" (
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "authz"."user_permission" (
	"user_id" uuid NOT NULL,
	"permission_id" integer NOT NULL,
	CONSTRAINT "user_permission_user_id_permission_id_pk" PRIMARY KEY("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "authz"."user_role" (
	"user_id" uuid NOT NULL,
	"role_id" integer NOT NULL,
	CONSTRAINT "user_role_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_dietary_restrictions" ADD CONSTRAINT "participant_dietary_restrictions_user_id_participants_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."participants"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_dietary_restrictions" ADD CONSTRAINT "participant_dietary_restrictions_restriction_id_dietary_restrictions_id_fk" FOREIGN KEY ("restriction_id") REFERENCES "public"."dietary_restrictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_interests" ADD CONSTRAINT "participant_interests_user_id_participants_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."participants"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_interests" ADD CONSTRAINT "participant_interests_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_gender_id_genders_id_fk" FOREIGN KEY ("gender_id") REFERENCES "public"."genders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_year_of_study_id_years_of_study_id_fk" FOREIGN KEY ("year_of_study_id") REFERENCES "public"."years_of_study"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_heard_from_id_heard_from_sources_id_fk" FOREIGN KEY ("heard_from_id") REFERENCES "public"."heard_from_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authz"."role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "authz"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authz"."role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "authz"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authz"."user_permission" ADD CONSTRAINT "user_permission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authz"."user_permission" ADD CONSTRAINT "user_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "authz"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authz"."user_role" ADD CONSTRAINT "user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authz"."user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "authz"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_participant_dietary_user_restriction" ON "participant_dietary_restrictions" USING btree ("user_id","restriction_id");--> statement-breakpoint
CREATE INDEX "idx_participant_interests_user_interest" ON "participant_interests" USING btree ("user_id","interest_id");--> statement-breakpoint
CREATE INDEX "idx_participants_user_id_created_at" ON "participants" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_participants_created_at_desc" ON "participants" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE VIEW "public"."participant_form_view" AS (
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
);--> statement-breakpoint
CREATE VIEW "public"."participant_view" AS (
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
);