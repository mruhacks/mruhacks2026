-- Every timestamp column in this schema was declared without a time zone.
-- Postgres would otherwise reinterpret each naive value using the session's
-- TimeZone when casting to `timestamp with time zone`; pinning the session
-- to UTC first makes that cast a no-op, since every value on disk is
-- already a UTC wall-clock (see AGENTS.md).
SET TIME ZONE 'UTC';--> statement-breakpoint
-- application_view / application_form_view both select event_applications.created_at
-- directly, so Postgres blocks ALTER COLUMN TYPE on it while they depend on it.
DROP VIEW "public"."application_form_view";--> statement-breakpoint
DROP VIEW "public"."application_view";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "access_token_expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "refresh_token_expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "invite" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invite" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "invite" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invite" ALTER COLUMN "expires_at" SET DEFAULT now() + interval '7 days';--> statement-breakpoint
ALTER TABLE "magic_link_cooldown" ALTER COLUMN "last_sent_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "magic_link_cooldown" ALTER COLUMN "last_sent_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "marketing_consents" ALTER COLUMN "changed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketing_consents" ALTER COLUMN "changed_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "privacy_acceptances" ALTER COLUMN "accepted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "privacy_acceptances" ALTER COLUMN "accepted_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "terms_acceptances" ALTER COLUMN "accepted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ALTER COLUMN "accepted_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "onboarding_completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "ban_expires" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "check_ins" ALTER COLUMN "checked_in_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "check_ins" ALTER COLUMN "checked_in_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_applications" ALTER COLUMN "reviewed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_applications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_applications" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_applications" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_applications" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_articles" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_articles" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_articles" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_articles" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_attendees" ALTER COLUMN "registered_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_attendees" ALTER COLUMN "registered_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ALTER COLUMN "responded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_rsvp_waves" ALTER COLUMN "respond_by" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_rsvp_waves" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_rsvp_waves" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "starts_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "ends_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "joined_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "joined_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_profile_about" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profile_about" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_profile_about" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profile_about" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
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
