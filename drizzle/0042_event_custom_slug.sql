ALTER TABLE "events" ADD COLUMN "slug" varchar(120);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_events_slug_unique" ON "events" USING btree ("slug");