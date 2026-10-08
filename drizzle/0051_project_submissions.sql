CREATE TABLE "submission_editors" (
	"submission_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_editors_submission_id_user_id_pk" PRIMARY KEY("submission_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"title" text NOT NULL,
	"markdown" text DEFAULT '' NOT NULL,
	"cover_image_url" text,
	"repo_url" text,
	"demo_url" text,
	"video_url" text,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"last_edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_votes" DROP CONSTRAINT "application_votes_voter_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_organizer_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "application_votes" ALTER COLUMN "voter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "organizer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "submissions_close_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission_editors" ADD CONSTRAINT "submission_editors_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_editors" ADD CONSTRAINT "submission_editors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_last_edited_by_user_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_team_id_unique" ON "submissions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_event_id" ON "submissions" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "application_votes" ADD CONSTRAINT "application_votes_voter_id_user_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organizer_id_user_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Submissions get their own narrow permissions (AGENTS.md): reading every
-- team's drafts, and deleting any submission for moderation/takedowns.
-- Purging a user is separate from `user:write:all` because it is the
-- compliance "erase everything" path, not routine account management.
INSERT INTO authz.permission (slug, description)
VALUES
  ('submission:read:all', 'View every project submission for an event, drafts included'),
  ('submission:delete:all', 'Delete any project submission (moderation, takedown requests)'),
  ('user:purge:all', 'Fully wipe a user account on a compliance request')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Additive: admins hold every permission, and organizers already moderate
-- teams. Purging stays admin-only. Never revoke — roles are editable at
-- runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE (r.slug = 'admin'
        AND p.slug IN ('submission:read:all', 'submission:delete:all', 'user:purge:all'))
    OR (r.slug = 'organizer'
        AND p.slug IN ('submission:read:all', 'submission:delete:all'))
ON CONFLICT DO NOTHING;
