CREATE TABLE "application_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"approve" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_votes" ADD CONSTRAINT "application_votes_participant_id_event_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."event_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_votes" ADD CONSTRAINT "application_votes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_votes" ADD CONSTRAINT "application_votes_voter_id_user_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_votes_participant_id_voter_id_unique" ON "application_votes" USING btree ("participant_id","voter_id");--> statement-breakpoint
CREATE INDEX "idx_application_votes_event_id" ON "application_votes" USING btree ("event_id");--> statement-breakpoint

-- The waitlist's order is derived from the votes on every read
-- (`@/lib/rsvp/waitlist`), so a stored rank would only drift from it.
ALTER TABLE "event_participants" DROP COLUMN "waitlist_position";
--> statement-breakpoint

-- Voting in the blind swipe review is its own narrow permission rather than a
-- reuse of `application:review:all`: a voter sees only review-tagged answers
-- and nudges the waitlist through a tally, never sets a status directly, so
-- it can later be handed to a wider reviewer pool (AGENTS.md).
INSERT INTO authz.permission (slug, description)
VALUES ('application:vote:all', 'Vote yes/no on applications in the blind swipe review')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Additive: admins hold every permission and organizers already review
-- applications. Never revoke — roles are editable at runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE r.slug IN ('admin', 'organizer')
   AND p.slug = 'application:vote:all'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- "Denied" covers applicants who can't be let in and applications known to be
-- vacuous, not just "we ran out of room"; it also stops a team being dragged
-- onto the waitlist with them.
UPDATE "participation_statuses" SET "title" = 'Denied' WHERE "label" = 'denied';
