CREATE TABLE "campaign_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"skip_reason" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "campaign_deliveries_status_check" CHECK ("campaign_deliveries"."status" IN ('queued', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"event_id" uuid,
	"subject" text DEFAULT '' NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"audience_rules" jsonb,
	"saved_audience_id" uuid,
	"audience_snapshot" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "campaigns_type_check" CHECK ("campaigns"."type" IN ('marketing', 'operational')),
	CONSTRAINT "campaigns_status_check" CHECK ("campaigns"."status" IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
	CONSTRAINT "campaigns_operational_event_check" CHECK ("campaigns"."type" <> 'operational' OR "campaigns"."event_id" IS NOT NULL),
	CONSTRAINT "campaigns_one_audience_check" CHECK (("campaigns"."audience_rules" IS NULL) <> ("campaigns"."saved_audience_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "saved_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rules" jsonb NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_deliveries" ADD CONSTRAINT "campaign_deliveries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_deliveries" ADD CONSTRAINT "campaign_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_saved_audience_id_saved_audiences_id_fk" FOREIGN KEY ("saved_audience_id") REFERENCES "public"."saved_audiences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_audiences" ADD CONSTRAINT "saved_audiences_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_audiences" ADD CONSTRAINT "saved_audiences_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_deliveries_campaign_id_user_id_unique" ON "campaign_deliveries" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_campaign_deliveries_campaign_id_status" ON "campaign_deliveries" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "idx_campaigns_status_scheduled_for" ON "campaigns" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_campaigns_saved_audience_id" ON "campaigns" USING btree ("saved_audience_id");--> statement-breakpoint

-- Campaign permissions. Each gates one thing (AGENTS.md): reading campaigns,
-- editing drafts and audiences, actually sending, and sending operational
-- (non-marketing) email, which skips the marketing-consent filter.
INSERT INTO authz.permission (slug, description)
VALUES
  ('campaign:read:all', 'View email campaigns and their results'),
  ('campaign:write:all', 'Create and edit campaign drafts and saved audiences'),
  ('campaign:send:all', 'Send or schedule email campaigns'),
  ('campaign:operational:all', 'Send operational (non-marketing) email to an event''s participants')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

INSERT INTO authz.role (slug, description)
VALUES ('marketing', 'Writes and sends marketing email campaigns')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Additive: admins and organizers get every campaign permission. Marketing
-- gets read/write/send plus aggregate application stats, and nothing that
-- opens event settings or applicant answers. Never revoke — roles are
-- editable at runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE (r.slug IN ('admin', 'organizer')
        AND p.slug IN ('campaign:read:all', 'campaign:write:all', 'campaign:send:all', 'campaign:operational:all'))
    OR (r.slug = 'marketing'
        AND p.slug IN ('campaign:read:all', 'campaign:write:all', 'campaign:send:all', 'application:stats:all'))
ON CONFLICT DO NOTHING;
