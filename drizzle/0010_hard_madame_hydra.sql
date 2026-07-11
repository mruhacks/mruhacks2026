ALTER TABLE "rsvp_statuses" ADD COLUMN "title" varchar(100);--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ADD COLUMN "description" varchar(500);--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ADD COLUMN "variant" varchar(20);--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ADD COLUMN "is_final" boolean;--> statement-breakpoint
UPDATE "rsvp_statuses" SET "title" = 'RSVP Invited', "description" = 'You''ve been invited to attend! Please respond before the deadline.', "variant" = 'default', "is_final" = false WHERE "label" = 'pending';--> statement-breakpoint
UPDATE "rsvp_statuses" SET "title" = 'RSVP Accepted', "description" = 'You''ve confirmed your attendance. See you there!', "variant" = 'success', "is_final" = true WHERE "label" = 'accepted';--> statement-breakpoint
UPDATE "rsvp_statuses" SET "title" = 'RSVP Declined', "description" = 'You''ve declined the invitation.', "variant" = 'destructive', "is_final" = true WHERE "label" = 'declined';--> statement-breakpoint
UPDATE "rsvp_statuses" SET "title" = 'RSVP Expired', "description" = 'The RSVP deadline has passed without a response.', "variant" = 'secondary', "is_final" = true WHERE "label" = 'timed_out';--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ALTER COLUMN "description" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ALTER COLUMN "variant" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ALTER COLUMN "is_final" SET NOT NULL;