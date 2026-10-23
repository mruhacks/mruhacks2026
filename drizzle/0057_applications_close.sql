ALTER TABLE "events" ADD COLUMN "applications_close_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "applications_closed" boolean DEFAULT false NOT NULL;