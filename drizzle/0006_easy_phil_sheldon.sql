ALTER TABLE "invitation_statuses" RENAME TO "rsvp_statuses";--> statement-breakpoint
ALTER TABLE "rsvp_statuses" DROP CONSTRAINT "invitation_statuses_label_unique";--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" DROP CONSTRAINT "event_rsvp_responses_status_id_invitation_statuses_id_fk";
--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD CONSTRAINT "event_rsvp_responses_status_id_rsvp_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."rsvp_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ADD CONSTRAINT "rsvp_statuses_label_unique" UNIQUE("label");