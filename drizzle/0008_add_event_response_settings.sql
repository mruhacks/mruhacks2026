ALTER TABLE "events" ADD COLUMN "allow_response_update" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "allow_multiple_responses" boolean DEFAULT false NOT NULL;
