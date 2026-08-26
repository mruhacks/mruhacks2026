CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"status" varchar(50) NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "public"."application_form_view";--> statement-breakpoint
DROP VIEW "public"."application_view";--> statement-breakpoint
ALTER TABLE "event_applications" DROP CONSTRAINT "event_applications_event_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "event_applications" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "event_applications" ADD COLUMN "status" varchar(50) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "parent_event_id" uuid;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_group_id_event_id_unique" ON "submissions" USING btree ("group_id","event_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_parent_event_id_events_id_fk" FOREIGN KEY ("parent_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_applications_event_id_user_id_unique" ON "event_applications" USING btree ("event_id","user_id");--> statement-breakpoint
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
  a.status,
  a.created_at
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
  a.status,
  a.created_at
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