CREATE TABLE "user_profile_professional" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"company" varchar(255) NOT NULL,
	"job_title" varchar(255) NOT NULL,
	"linkedin_url" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_judges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"email" varchar(255),
	"user_id" uuid,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_notes" (
	"user_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judge_notes_user_id_submission_id_pk" PRIMARY KEY("user_id","submission_id")
);
--> statement-breakpoint
CREATE TABLE "judge_reliability" (
	"judge_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"alpha" double precision NOT NULL,
	"beta" double precision NOT NULL,
	CONSTRAINT "judge_reliability_judge_id_criterion_id_pk" PRIMARY KEY("judge_id","criterion_id")
);
--> statement-breakpoint
CREATE TABLE "judge_skips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judge_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judge_skips_reason_valid" CHECK ("judge_skips"."reason" IN ('not_here', 'conflict'))
);
--> statement-breakpoint
CREATE TABLE "judge_state" (
	"judge_id" uuid PRIMARY KEY NOT NULL,
	"current_submission_id" uuid,
	"previous_submission_id" uuid,
	"assigned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "judging_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(300) DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judging_criteria_weight_nonnegative" CHECK ("judging_criteria"."weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "judging_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judge_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"winner_submission_id" uuid NOT NULL,
	"loser_submission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_scores" (
	"submission_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"mu" double precision NOT NULL,
	"sigma_sq" double precision NOT NULL,
	CONSTRAINT "submission_scores_submission_id_criterion_id_pk" PRIMARY KEY("submission_id","criterion_id")
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "finalist" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "placement" integer;--> statement-breakpoint
ALTER TABLE "user_profile_professional" ADD CONSTRAINT "user_profile_professional_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_judges" ADD CONSTRAINT "event_judges_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_judges" ADD CONSTRAINT "event_judges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_notes" ADD CONSTRAINT "judge_notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_notes" ADD CONSTRAINT "judge_notes_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_reliability" ADD CONSTRAINT "judge_reliability_judge_id_event_judges_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."event_judges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_reliability" ADD CONSTRAINT "judge_reliability_criterion_id_judging_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."judging_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_skips" ADD CONSTRAINT "judge_skips_judge_id_event_judges_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."event_judges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_skips" ADD CONSTRAINT "judge_skips_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_state" ADD CONSTRAINT "judge_state_judge_id_event_judges_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."event_judges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_state" ADD CONSTRAINT "judge_state_current_submission_id_submissions_id_fk" FOREIGN KEY ("current_submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_state" ADD CONSTRAINT "judge_state_previous_submission_id_submissions_id_fk" FOREIGN KEY ("previous_submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judging_criteria" ADD CONSTRAINT "judging_criteria_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judging_votes" ADD CONSTRAINT "judging_votes_judge_id_event_judges_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."event_judges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judging_votes" ADD CONSTRAINT "judging_votes_criterion_id_judging_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."judging_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judging_votes" ADD CONSTRAINT "judging_votes_winner_submission_id_submissions_id_fk" FOREIGN KEY ("winner_submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judging_votes" ADD CONSTRAINT "judging_votes_loser_submission_id_submissions_id_fk" FOREIGN KEY ("loser_submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_scores" ADD CONSTRAINT "submission_scores_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_scores" ADD CONSTRAINT "submission_scores_criterion_id_judging_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."judging_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_judges_event_id_email_unique" ON "event_judges" USING btree ("event_id","email") WHERE "event_judges"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_judges_event_id_user_id_unique" ON "event_judges" USING btree ("event_id","user_id") WHERE "event_judges"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_event_judges_user_id" ON "event_judges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_judge_skips_judge_id" ON "judge_skips" USING btree ("judge_id");--> statement-breakpoint
CREATE INDEX "idx_judge_state_current" ON "judge_state" USING btree ("current_submission_id");--> statement-breakpoint
CREATE INDEX "idx_judging_criteria_event_id" ON "judging_criteria" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_judging_votes_judge_id" ON "judging_votes" USING btree ("judge_id");--> statement-breakpoint
CREATE INDEX "idx_judging_votes_criterion_id_created_at" ON "judging_votes" USING btree ("criterion_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_judging_votes_winner" ON "judging_votes" USING btree ("winner_submission_id");--> statement-breakpoint
CREATE INDEX "idx_judging_votes_loser" ON "judging_votes" USING btree ("loser_submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_event_id_placement_unique" ON "submissions" USING btree ("event_id","placement") WHERE "submissions"."placement" IS NOT NULL;--> statement-breakpoint

-- Expo judging gets three narrow permissions (AGENTS.md): running judging
-- (criteria, weights, roster, deactivating projects), viewing the rankings,
-- and recording finalists and placements. Judges themselves are authorized by
-- roster membership, not by any of these.
INSERT INTO authz.permission (slug, description)
VALUES
  ('judging:manage:all', 'Manage expo judging criteria, weights and the judge roster, and deactivate projects'),
  ('judging:results:all', 'View live expo judging rankings'),
  ('judging:award:all', 'Flag finalists and record overall placements')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Additive: admins hold every permission, and organizers run the expo.
-- Never revoke — roles are editable at runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE r.slug IN ('admin', 'organizer')
   AND p.slug IN ('judging:manage:all', 'judging:results:all', 'judging:award:all')
ON CONFLICT DO NOTHING;
