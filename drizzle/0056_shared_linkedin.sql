DROP VIEW "public"."application_form_view";--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "linkedin_url" varchar(255);--> statement-breakpoint
-- LinkedIn used to be stored twice: on the student (About) row and on the
-- judge's Professional row. Carry it over to the one shared column before
-- both copies are dropped, preferring the student value when both are set.
UPDATE "user_profiles" p
   SET "linkedin_url" = COALESCE(pa."linkedin_url", pp."linkedin_url")
  FROM "user_profiles" p2
  LEFT JOIN "user_profile_about" pa ON pa."user_id" = p2."user_id"
  LEFT JOIN "user_profile_professional" pp ON pp."user_id" = p2."user_id"
 WHERE p2."user_id" = p."user_id"
   AND COALESCE(pa."linkedin_url", pp."linkedin_url") IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_profile_about" DROP COLUMN "linkedin_url";--> statement-breakpoint
ALTER TABLE "user_profile_professional" DROP COLUMN "linkedin_url";--> statement-breakpoint
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
  p.linkedin_url,
  pa.github_url,
  p.gender_other_text,
  pa.university_other_text,
  pa.major_other_text,
  p.dietary_other_text
FROM event_participants a
JOIN user_profiles p ON p.user_id = a.user_id
LEFT JOIN user_profile_about pa ON pa.user_id = a.user_id
LEFT JOIN interests_agg i ON i.user_id = a.user_id
LEFT JOIN dietary_agg d ON d.user_id = a.user_id
);