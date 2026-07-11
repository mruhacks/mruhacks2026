ALTER TABLE "user" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "resume_file" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "resume_file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "resume_file_type" varchar(100);