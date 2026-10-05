ALTER TABLE "user" ADD COLUMN "legacy_import_2025" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_legacy_import_2025_check" CHECK ("user"."legacy_import_2025" IN ('created', 'linked'));
