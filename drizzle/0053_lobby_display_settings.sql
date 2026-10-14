CREATE TABLE "display_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"show_clock" boolean DEFAULT false NOT NULL,
	"theme" text DEFAULT 'light' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "display_settings_singleton_check" CHECK ("display_settings"."id" = 1),
	CONSTRAINT "display_settings_theme_check" CHECK ("display_settings"."theme" in ('light', 'dark'))
);
--> statement-breakpoint
ALTER TABLE "display_settings" ADD CONSTRAINT "display_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;