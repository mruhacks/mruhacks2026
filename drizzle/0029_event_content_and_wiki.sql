CREATE TABLE "event_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "description_markdown" text;--> statement-breakpoint
ALTER TABLE "event_articles" ADD CONSTRAINT "event_articles_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_articles" ADD CONSTRAINT "event_articles_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_articles" ADD CONSTRAINT "event_articles_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_articles_event_id_slug_unique" ON "event_articles" USING btree ("event_id","slug");--> statement-breakpoint
CREATE INDEX "idx_event_articles_event_id_published" ON "event_articles" USING btree ("event_id","published");
--> statement-breakpoint
-- The wiki is gated on its own permissions rather than folded into
-- `event:manage:all`, so a note-taking organizer can be granted article
-- authorship without also getting the power to retime or delete events.
-- The static seed grants the same rows, but deployed databases only run
-- migrations — so create them here too.
INSERT INTO "authz"."permission" ("slug", "description") VALUES
    ('article:read:all', 'View unpublished event wiki articles'),
    ('article:write:all', 'Create, edit, publish and delete event wiki articles')
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
INSERT INTO "authz"."role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
    FROM "authz"."role" r
    CROSS JOIN "authz"."permission" p
    WHERE r."slug" IN ('admin', 'organizer')
      AND p."slug" IN ('article:read:all', 'article:write:all')
ON CONFLICT DO NOTHING;