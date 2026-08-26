CREATE TABLE "user_consents" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"marketing_emails" boolean DEFAULT false NOT NULL,
	"marketing_consent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;