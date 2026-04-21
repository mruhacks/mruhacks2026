CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_name_idx" ON "user" USING btree ("name");--> statement-breakpoint
CREATE INDEX "user_created_at_idx" ON "user" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_email_trgm_idx" ON "user" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "user_name_trgm_idx" ON "user" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "role_permission_permission_id_idx" ON "authz"."role_permission" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_permission_permission_id_idx" ON "authz"."user_permission" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_role_role_id_idx" ON "authz"."user_role" USING btree ("role_id");