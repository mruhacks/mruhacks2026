CREATE TABLE "permission" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"action" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "permission_entity_action_scope_unique" UNIQUE("entity","action","scope")
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" integer,
	"permission_id" integer,
	CONSTRAINT "role_permission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "role_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_permission" (
	"user_id" uuid,
	"permission_id" integer,
	CONSTRAINT "user_permission_user_id_permission_id_pk" PRIMARY KEY("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"user_id" uuid,
	"role_id" integer,
	CONSTRAINT "user_role_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
DROP VIEW "public"."participant_view";--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_perm_entity" ON "permission" USING btree ("entity");--> statement-breakpoint
CREATE INDEX "idx_perm_action" ON "permission" USING btree ("action");--> statement-breakpoint
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