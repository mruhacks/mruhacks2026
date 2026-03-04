CREATE TABLE "check_ins" (
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"checked_in_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(50) NOT NULL,
	CONSTRAINT "event_types_label_unique" UNIQUE("label")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "event_type_id" integer;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "check_ins_user_id_event_id_unique" ON "check_ins" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_event_id_checked_in_at" ON "check_ins" USING btree ("event_id","checked_in_at");--> statement-breakpoint
CREATE INDEX "idx_check_ins_user_id" ON "check_ins" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE set null ON UPDATE no action;