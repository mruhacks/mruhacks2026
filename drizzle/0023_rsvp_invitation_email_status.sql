ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_status" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_last_error" text;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_queued_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_sent_at" timestamp;--> statement-breakpoint
CREATE INDEX "idx_event_rsvp_responses_invitation_email_status" ON "event_rsvp_responses" USING btree ("invitation_email_status");