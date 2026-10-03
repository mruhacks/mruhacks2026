-- Unify application status, RSVP status and event_attendees into a single
-- participation status on one row per (event, user). See the registration
-- flow in docs/ARCHITECTURE.md.
--
--   event_applications   -> event_participants (status_id now -> participation_statuses)
--   event_rsvp_responses -> event_invitations  (no status of its own; one per participant)
--   event_attendees      -> dropped (attending == status 'accepted')
--   application_statuses, rsvp_statuses -> participation_statuses

-- 1. The one status lookup. Display text is upserted again by seed-static.
CREATE TABLE "participation_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(50) NOT NULL,
	"title" varchar(100) NOT NULL,
	"description" varchar(500) NOT NULL,
	"variant" varchar(20) NOT NULL,
	CONSTRAINT "participation_statuses_label_unique" UNIQUE("label")
);
--> statement-breakpoint
INSERT INTO "participation_statuses" ("label", "title", "description", "variant") VALUES
	('pending_review', 'Under review', 'We''re reviewing your application and will email you when a decision has been made.', 'warning'),
	('approved', 'Approved', 'You''ve been approved! Watch your email for an RSVP invitation to confirm your spot.', 'success'),
	('waitlisted', 'Waitlisted', 'You''re on the waitlist. We''ll email you an invitation when a spot opens up.', 'secondary'),
	('denied', 'Not accepted', 'Thanks for applying — unfortunately we were not able to offer you a spot. Please contact us if you think this was a mistake.', 'destructive'),
	('invited', 'RSVP required', 'You''ve been offered a spot! Please confirm whether you will attend before the deadline.', 'purple'),
	('accepted', 'Confirmed', 'Your spot is confirmed. We''ll see you there!', 'success'),
	('declined', 'Declined', 'You''ve given up your spot.', 'destructive'),
	('timed_out', 'RSVP expired', 'Your RSVP window ended without a response.', 'secondary');
--> statement-breakpoint

-- 2. event_applications -> event_participants.
ALTER TABLE "event_applications" RENAME TO "event_participants";
--> statement-breakpoint
ALTER TABLE "event_participants" RENAME CONSTRAINT "event_applications_pkey" TO "event_participants_pkey";
--> statement-breakpoint
ALTER TABLE "event_participants" RENAME CONSTRAINT "event_applications_event_id_events_id_fk" TO "event_participants_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "event_participants" RENAME CONSTRAINT "event_applications_user_id_user_id_fk" TO "event_participants_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "event_participants" RENAME CONSTRAINT "event_applications_reviewed_by_user_id_fk" TO "event_participants_reviewed_by_user_id_fk";
--> statement-breakpoint
ALTER INDEX "event_applications_event_id_user_id_unique" RENAME TO "event_participants_event_id_user_id_unique";
--> statement-breakpoint
ALTER INDEX "idx_event_applications_event_id_created_at" RENAME TO "idx_event_participants_event_id_created_at";
--> statement-breakpoint
ALTER INDEX "idx_event_applications_user_id" RENAME TO "idx_event_participants_user_id";
--> statement-breakpoint
ALTER TABLE "event_participants" ADD COLUMN "participation_status_id" integer;
--> statement-breakpoint

-- 3. Backfill the participation status. The latest-wave RSVP, when there is
-- one, is the status of record (the same precedence every reader applied
-- before); otherwise the application review status carries over.
WITH latest_rsvp AS (
	SELECT DISTINCT ON (r.user_id, w.event_id)
		r.user_id, w.event_id, rs.label AS rsvp_label
	FROM "event_rsvp_responses" r
	JOIN "event_rsvp_waves" w ON w.id = r.rsvp_wave_id
	LEFT JOIN "rsvp_statuses" rs ON rs.id = r.status_id
	ORDER BY r.user_id, w.event_id, w.wave DESC
)
UPDATE "event_participants" p
SET "participation_status_id" = ps.id
FROM "event_participants" p2
LEFT JOIN "application_statuses" a ON a.id = p2.status_id
LEFT JOIN latest_rsvp l ON l.user_id = p2.user_id AND l.event_id = p2.event_id
JOIN "participation_statuses" ps ON ps.label = CASE
	WHEN l.user_id IS NOT NULL THEN CASE COALESCE(l.rsvp_label, 'pending')
		WHEN 'pending' THEN 'invited'
		ELSE l.rsvp_label
	END
	ELSE COALESCE(a.label, 'pending_review')
END
WHERE p.id = p2.id;
--> statement-breakpoint

-- An attendee row meant "attending". Where the participant hasn't made an
-- RSVP decision of their own (pre-RSVP approvals, or an attendee who was
-- invited again), that becomes `accepted`. A recorded decline/time-out or a
-- denial is kept: those already read as not attending everywhere it's shown.
UPDATE "event_participants" p
SET "participation_status_id" = (SELECT id FROM "participation_statuses" WHERE label = 'accepted')
FROM "event_attendees" at, "participation_statuses" cur
WHERE at.event_id = p.event_id
	AND at.user_id = p.user_id
	AND cur.id = p.participation_status_id
	AND cur.label IN ('pending_review', 'approved', 'waitlisted', 'invited');
--> statement-breakpoint

-- Signups for events without an application become participants directly.
INSERT INTO "event_participants" ("event_id", "user_id", "participation_status_id", "created_at", "updated_at")
SELECT at.event_id, at.user_id, (SELECT id FROM "participation_statuses" WHERE label = 'accepted'), at.registered_at, at.registered_at
FROM "event_attendees" at
WHERE NOT EXISTS (
	SELECT 1 FROM "event_participants" p
	WHERE p.event_id = at.event_id AND p.user_id = at.user_id
);
--> statement-breakpoint

DO $$
DECLARE
	missing integer;
BEGIN
	SELECT count(*) INTO missing FROM "event_participants" WHERE "participation_status_id" IS NULL;
	IF missing > 0 THEN
		RAISE EXCEPTION 'unify participation status: % participant(s) left without a status', missing;
	END IF;
	SELECT count(*) INTO missing FROM "event_attendees" at
	WHERE NOT EXISTS (
		SELECT 1 FROM "event_participants" p
		WHERE p.event_id = at.event_id AND p.user_id = at.user_id
	);
	IF missing > 0 THEN
		RAISE EXCEPTION 'unify participation status: % attendee(s) not carried over', missing;
	END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "event_participants" DROP CONSTRAINT "event_applications_status_id_application_statuses_id_fk";
--> statement-breakpoint
ALTER TABLE "event_participants" DROP COLUMN "status_id";
--> statement-breakpoint
ALTER TABLE "event_participants" RENAME COLUMN "participation_status_id" TO "status_id";
--> statement-breakpoint
ALTER TABLE "event_participants" ALTER COLUMN "status_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_status_id_participation_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."participation_statuses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_event_participants_event_id_status_id" ON "event_participants" USING btree ("event_id","status_id");
--> statement-breakpoint
-- Waitlist order only means something while waitlisted.
UPDATE "event_participants" SET "waitlist_position" = NULL
WHERE "status_id" <> (SELECT id FROM "participation_statuses" WHERE label = 'waitlisted');
--> statement-breakpoint

-- 4. event_rsvp_responses -> event_invitations, keyed by participant.
ALTER TABLE "event_rsvp_responses" RENAME TO "event_invitations";
--> statement-breakpoint
ALTER TABLE "event_invitations" RENAME CONSTRAINT "event_rsvp_responses_pkey" TO "event_invitations_pkey";
--> statement-breakpoint
ALTER TABLE "event_invitations" RENAME CONSTRAINT "event_rsvp_responses_rsvp_wave_id_event_rsvp_waves_id_fk" TO "event_invitations_rsvp_wave_id_event_rsvp_waves_id_fk";
--> statement-breakpoint
ALTER TABLE "event_invitations" RENAME CONSTRAINT "event_rsvp_responses_accepted_terms_id_event_terms_id_fk" TO "event_invitations_accepted_terms_id_event_terms_id_fk";
--> statement-breakpoint
ALTER INDEX "idx_event_rsvp_responses_invitation_email_status" RENAME TO "idx_event_invitations_invitation_email_status";
--> statement-breakpoint
ALTER TABLE "event_invitations" ADD COLUMN "participant_id" uuid;
--> statement-breakpoint
UPDATE "event_invitations" i
SET "participant_id" = p.id
FROM "event_rsvp_waves" w, "event_participants" p
WHERE w.id = i.rsvp_wave_id AND p.event_id = w.event_id AND p.user_id = i.user_id;
--> statement-breakpoint
-- Every invitation belongs to an application, and wave eligibility never
-- invited anyone twice, so neither delete is expected to match anything.
-- They make the NOT NULL / UNIQUE below safe rather than fatal if one does.
DELETE FROM "event_invitations" WHERE "participant_id" IS NULL;
--> statement-breakpoint
DELETE FROM "event_invitations" i
USING "event_invitations" j, "event_rsvp_waves" wi, "event_rsvp_waves" wj
WHERE i.participant_id = j.participant_id
	AND wi.id = i.rsvp_wave_id
	AND wj.id = j.rsvp_wave_id
	AND wi.wave < wj.wave;
--> statement-breakpoint
ALTER TABLE "event_invitations" ALTER COLUMN "participant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_participant_id_event_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."event_participants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "event_invitations_participant_id_unique" ON "event_invitations" USING btree ("participant_id");
--> statement-breakpoint
CREATE INDEX "idx_event_invitations_rsvp_wave_id" ON "event_invitations" USING btree ("rsvp_wave_id");
--> statement-breakpoint
DROP INDEX "event_rsvp_responses_rsvp_wave_id_user_id_unique";
--> statement-breakpoint
ALTER TABLE "event_invitations" DROP CONSTRAINT "event_rsvp_responses_status_id_rsvp_statuses_id_fk";
--> statement-breakpoint
ALTER TABLE "event_invitations" DROP CONSTRAINT "event_rsvp_responses_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "event_invitations" DROP COLUMN "status_id";
--> statement-breakpoint
ALTER TABLE "event_invitations" DROP COLUMN "user_id";
--> statement-breakpoint

-- 5. Retire what the participation status replaces.
DROP TABLE "event_attendees";
--> statement-breakpoint
DROP TABLE "application_statuses";
--> statement-breakpoint
DROP TABLE "rsvp_statuses";
