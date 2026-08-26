ALTER TABLE "events" ADD COLUMN "register_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_events_featured_unique" ON "events" USING btree ("is_featured") WHERE "events"."is_featured" = true;