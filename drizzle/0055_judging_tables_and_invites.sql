ALTER TABLE "events" ADD COLUMN "judging_table_rows" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "judging_table_row_alphabet" text DEFAULT 'latin' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "judging_table_column_alphabet" text DEFAULT 'arabic' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "judging_next_table_slot" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "table_slot" integer;--> statement-breakpoint
ALTER TABLE "event_judges" ADD COLUMN "invite_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_event_id_table_slot_unique" ON "submissions" USING btree ("event_id","table_slot");--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN "finalist";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_judging_table_rows_positive" CHECK ("events"."judging_table_rows" >= 1);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_judging_table_row_alphabet_valid" CHECK ("events"."judging_table_row_alphabet" IN ('latin', 'arabic', 'roman'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_judging_table_column_alphabet_valid" CHECK ("events"."judging_table_column_alphabet" IN ('latin', 'arabic', 'roman'));--> statement-breakpoint

-- Table numbers used to be derived on every read: rank by (created_at, id)
-- over all of an event's submissions, drafts included. Store exactly that
-- rank (0-based) so every existing project keeps its number, and start each
-- event's counter after its highest slot. From here on a slot is handed out
-- once, at first publish, and never changes.
UPDATE "submissions" s
   SET "table_slot" = ranked.slot
  FROM (
    SELECT id, (row_number() OVER (PARTITION BY event_id ORDER BY created_at, id) - 1)::int AS slot
      FROM "submissions"
  ) ranked
 WHERE ranked.id = s.id;
--> statement-breakpoint
UPDATE "events" e
   SET "judging_next_table_slot" = taken.next_slot
  FROM (
    SELECT event_id, max(table_slot) + 1 AS next_slot
      FROM "submissions"
     GROUP BY event_id
  ) taken
 WHERE taken.event_id = e.id;
--> statement-breakpoint

-- A placement held by a project outside the results pool can't be seen or
-- cleared from the results page, and blocks that place for everyone else.
-- Leaving the pool now clears it; clear the ones that already left.
UPDATE "submissions"
   SET "placement" = NULL
 WHERE "placement" IS NOT NULL
   AND ("deactivated_at" IS NOT NULL OR NOT "published");
--> statement-breakpoint

-- Every judge on the roster so far was emailed when they were added.
UPDATE "event_judges" SET "invite_sent_at" = "created_at" WHERE "invite_sent_at" IS NULL;
--> statement-breakpoint

-- Finalists are gone; the award permission now covers placements only. The
-- manage permission also covers the table layout.
UPDATE authz.permission
   SET description = 'Record overall placements'
 WHERE slug = 'judging:award:all';
--> statement-breakpoint
UPDATE authz.permission
   SET description = 'Manage expo judging criteria, weights, table layout and the judge roster, and deactivate projects'
 WHERE slug = 'judging:manage:all';
