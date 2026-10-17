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
--> statement-breakpoint
-- One permission covers the lobby-display settings every screen follows. The
-- screens themselves hold no credentials: /display and its feed are public.
INSERT INTO authz.permission (slug, description)
VALUES ('display:manage:all', 'Configure the lobby displays (clock, theme)')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Additive: admins hold every permission, and organizers run the event floor.
-- Never revoke — roles are editable at runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE r.slug IN ('admin', 'organizer')
   AND p.slug = 'display:manage:all'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- The settings table is a singleton every screen reads; seed its one row so
-- reads never have to handle it missing.
INSERT INTO display_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
