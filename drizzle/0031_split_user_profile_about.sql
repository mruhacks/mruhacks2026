CREATE TABLE "user_profile_about" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"university_id" integer NOT NULL,
	"university_other_text" varchar(255),
	"major_id" integer NOT NULL,
	"major_other_text" varchar(255),
	"year_of_study_id" integer NOT NULL,
	"attended_hackathon_before" boolean DEFAULT false NOT NULL,
	"linkedin_url" varchar(255),
	"github_url" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "user_profile_about" (
	"user_id", "university_id", "university_other_text", "major_id",
	"major_other_text", "year_of_study_id", "attended_hackathon_before",
	"linkedin_url", "github_url", "created_at", "updated_at"
)
SELECT
	"user_id", "university_id", "university_other_text", "major_id",
	"major_other_text", "year_of_study_id", "attended_hackathon_before",
	"linkedin_url", "github_url", "created_at", "updated_at"
FROM "user_profiles"
WHERE "university_id" IS NOT NULL;--> statement-breakpoint
DROP VIEW "public"."application_form_view";--> statement-breakpoint
DROP VIEW "public"."application_view";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_university_id_universities_id_fk";
--> statement-breakpoint
ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_major_id_majors_id_fk";
--> statement-breakpoint
ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_year_of_study_id_years_of_study_id_fk";
--> statement-breakpoint
ALTER TABLE "user_profile_about" ADD CONSTRAINT "user_profile_about_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_about" ADD CONSTRAINT "user_profile_about_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_about" ADD CONSTRAINT "user_profile_about_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_about" ADD CONSTRAINT "user_profile_about_year_of_study_id_years_of_study_id_fk" FOREIGN KEY ("year_of_study_id") REFERENCES "public"."years_of_study"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "university_id";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "university_other_text";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "major_id";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "major_other_text";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "year_of_study_id";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "attended_hackathon_before";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "linkedin_url";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "github_url";--> statement-breakpoint
CREATE VIEW "public"."application_form_view" AS (
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
);--> statement-breakpoint
CREATE VIEW "public"."application_view" AS (
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
);