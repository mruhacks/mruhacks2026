CREATE TABLE "marketing_consents" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"opted_in" boolean DEFAULT false NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "marketing_consents" ("user_id", "opted_in", "changed_at")
	SELECT "user_id", "marketing_emails", COALESCE("marketing_consent_at", "updated_at", now())
	FROM "user_consents";--> statement-breakpoint
DROP TABLE "user_consents" CASCADE;--> statement-breakpoint
ALTER TABLE "marketing_consents" ADD CONSTRAINT "marketing_consents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_acceptances" ADD CONSTRAINT "privacy_acceptances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_acceptances_user_id_idx" ON "privacy_acceptances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "terms_acceptances_user_id_idx" ON "terms_acceptances" USING btree ("user_id");