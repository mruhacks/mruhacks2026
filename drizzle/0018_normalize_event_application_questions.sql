UPDATE "events"
SET "application_questions" = '[]'::jsonb
WHERE "application_questions" IS NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "application_questions" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "application_questions" SET NOT NULL;
