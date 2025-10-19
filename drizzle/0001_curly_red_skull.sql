CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"scope" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_dietary_restrictions" (
	"user_id" uuid NOT NULL,
	"restriction_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_interests" (
	"user_id" uuid NOT NULL,
	"interest_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"attended_before" boolean DEFAULT false NOT NULL,
	"gender_id" integer NOT NULL,
	"university_id" integer NOT NULL,
	"major_id" integer NOT NULL,
	"year_of_study_id" integer NOT NULL,
	"accommodations" text,
	"needs_parking" boolean DEFAULT false NOT NULL,
	"heard_from_id" integer NOT NULL,
	"consent_info_use" boolean NOT NULL,
	"consent_sponsor_share" boolean NOT NULL,
	"consent_media_use" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dietary_restrictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(150) NOT NULL,
	CONSTRAINT "dietary_restrictions_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "genders" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(100) NOT NULL,
	CONSTRAINT "genders_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "heard_from_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(150) NOT NULL,
	CONSTRAINT "heard_from_sources_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(150) NOT NULL,
	CONSTRAINT "interests_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "majors" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(150) NOT NULL,
	CONSTRAINT "majors_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "universities" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(200) NOT NULL,
	CONSTRAINT "universities_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "years_of_study" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(10) NOT NULL,
	CONSTRAINT "years_of_study_label_unique" UNIQUE("label")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_dietary_restrictions" ADD CONSTRAINT "participant_dietary_restrictions_user_id_participants_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."participants"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_dietary_restrictions" ADD CONSTRAINT "participant_dietary_restrictions_restriction_id_dietary_restrictions_id_fk" FOREIGN KEY ("restriction_id") REFERENCES "public"."dietary_restrictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_interests" ADD CONSTRAINT "participant_interests_user_id_participants_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."participants"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_interests" ADD CONSTRAINT "participant_interests_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_gender_id_genders_id_fk" FOREIGN KEY ("gender_id") REFERENCES "public"."genders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_year_of_study_id_years_of_study_id_fk" FOREIGN KEY ("year_of_study_id") REFERENCES "public"."years_of_study"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_heard_from_id_heard_from_sources_id_fk" FOREIGN KEY ("heard_from_id") REFERENCES "public"."heard_from_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_user_idx" ON "account" USING btree ("provider_id","provider_account_id");