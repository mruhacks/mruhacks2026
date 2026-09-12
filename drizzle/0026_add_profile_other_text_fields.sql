DROP VIEW "public"."application_form_view";--> statement-breakpoint
DROP VIEW "public"."application_view";--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "gender_other_text" varchar(255);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "university_other_text" varchar(255);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "major_other_text" varchar(255);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "dietary_other_text" varchar(255);--> statement-breakpoint
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
  p.university_id,
  p.major_id,
  p.year_of_study_id,
  COALESCE(i.interests, '{}'::integer[]) AS interests,
  COALESCE(d.dietary_restrictions, '{}'::integer[]) AS dietary_restrictions,
  a.responses,
  a.created_at,
  p.linkedin_url,
  p.github_url,
  p.gender_other_text,
  p.university_other_text,
  p.major_other_text,
  p.dietary_other_text
FROM event_applications a
JOIN user_profiles p ON p.user_id = a.user_id
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
  p.linkedin_url,
  p.github_url,
  p.gender_other_text,
  p.university_other_text,
  p.major_other_text,
  p.dietary_other_text
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
);