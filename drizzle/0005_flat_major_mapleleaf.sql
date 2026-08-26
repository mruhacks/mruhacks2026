CREATE TABLE "event_rsvp_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rsvp_wave_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status_id" integer,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_rsvp_waves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"wave" smallint NOT NULL,
	"respond_by" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(50) NOT NULL,
	CONSTRAINT "application_statuses_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "invitation_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(50) NOT NULL,
	CONSTRAINT "invitation_statuses_label_unique" UNIQUE("label")
);
--> statement-breakpoint
ALTER TABLE "event_applications" ADD COLUMN "status_id" integer;--> statement-breakpoint
ALTER TABLE "event_applications" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_applications" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "event_applications" ADD COLUMN "waitlist_position" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD CONSTRAINT "event_rsvp_responses_rsvp_wave_id_event_rsvp_waves_id_fk" FOREIGN KEY ("rsvp_wave_id") REFERENCES "public"."event_rsvp_waves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD CONSTRAINT "event_rsvp_responses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp_responses" ADD CONSTRAINT "event_rsvp_responses_status_id_invitation_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."invitation_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp_waves" ADD CONSTRAINT "event_rsvp_waves_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvp_responses_rsvp_wave_id_user_id_unique" ON "event_rsvp_responses" USING btree ("rsvp_wave_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvp_waves_event_id_wave_unique" ON "event_rsvp_waves" USING btree ("event_id","wave");--> statement-breakpoint
ALTER TABLE "event_applications" ADD CONSTRAINT "event_applications_status_id_application_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."application_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_applications" ADD CONSTRAINT "event_applications_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;