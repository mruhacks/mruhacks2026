ALTER TABLE "rsvp_statuses" ADD COLUMN "title" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ADD COLUMN "description" varchar(500) NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ADD COLUMN "variant" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvp_statuses" ADD COLUMN "is_final" boolean NOT NULL;