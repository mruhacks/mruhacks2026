ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_status_check";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approval_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approval_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approval_requested_by_user_id_fk" FOREIGN KEY ("approval_requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_status_check" CHECK ("campaigns"."status" IN ('draft', 'pending_approval', 'scheduled', 'sending', 'sent', 'cancelled'));