CREATE TABLE "event_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD COLUMN "accepted_terms_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "terms_id" uuid;--> statement-breakpoint
ALTER TABLE "event_terms" ADD CONSTRAINT "event_terms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_event_terms_event" ON "event_terms" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD CONSTRAINT "event_rsvp_responses_accepted_terms_id_event_terms_id_fk" FOREIGN KEY ("accepted_terms_id") REFERENCES "public"."event_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_terms_id_event_terms_id_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."event_terms"("id") ON DELETE no action ON UPDATE no action;