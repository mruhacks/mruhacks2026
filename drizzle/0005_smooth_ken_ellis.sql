DROP VIEW "public"."participant_form_view";--> statement-breakpoint
DROP VIEW "public"."participant_view";--> statement-breakpoint
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
SELECT
  p.user_id,
  u.email,
  p.full_name,
  g.label AS gender,
  un.label AS university,
  m.label AS major,
  y.label AS year_of_study,
  h.label AS heard_from,
  p.needs_parking,
  p.attended_before,
  p.created_at,
  COALESCE(
    array_agg(DISTINCT i.label) FILTER (
      WHERE
        i.label IS NOT NULL
    ),
    ARRAY[]::text[]::character varying[]
  ) AS interests,
  COALESCE(
    array_agg(DISTINCT d.label) FILTER (
      WHERE
        d.label IS NOT NULL
    ),
    ARRAY[]::text[]::character varying[]
  ) AS dietary_restrictions
FROM
  participants p
  JOIN "user" u ON u.id = p.user_id
  LEFT JOIN genders g ON g.id = p.gender_id
  LEFT JOIN universities un ON un.id = p.university_id
  LEFT JOIN majors m ON m.id = p.major_id
  LEFT JOIN years_of_study y ON y.id = p.year_of_study_id
  LEFT JOIN heard_from_sources h ON h.id = p.heard_from_id
  LEFT JOIN participant_interests pi ON pi.user_id = p.user_id
  LEFT JOIN interests i ON i.id = pi.interest_id
  LEFT JOIN participant_dietary_restrictions pd ON pd.user_id = p.user_id
  LEFT JOIN dietary_restrictions d ON d.id = pd.restriction_id
GROUP BY
  p.user_id,
  u.email,
  p.full_name,
  g.label,
  un.label,
  m.label,
  y.label,
  h.label,
  p.needs_parking,
  p.attended_before,
  p.created_at
ORDER BY
  p.created_at DESC
);
