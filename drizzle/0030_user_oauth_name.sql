ALTER TABLE "user" ADD COLUMN "oauth_name" text;--> statement-breakpoint
-- Better Auth only maps provider fields at account creation, so existing OAuth
-- users would otherwise never get an oauth_name. For Google, `name` is the
-- provider's real name and can be carried over; GitHub's may be a handle, so
-- those accounts are deliberately left null rather than pre-filling a handle.
UPDATE "user" SET "oauth_name" = "name"
WHERE "name" <> ''
  AND EXISTS (
    SELECT 1 FROM "account" a
    WHERE a."user_id" = "user"."id" AND a."provider_id" = 'google'
  );
