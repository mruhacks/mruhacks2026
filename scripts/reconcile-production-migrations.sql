-- ONE-TIME WRITE SCRIPT for the production state in scripts/output.
-- Reconciliation checkpoint: current repository migration 0039.
-- Review docs/MIGRATION_RECOVERY.md before use. Rehearse on a restored backup.
-- Stop competing migrations/schema jobs. This transaction takes table locks.
-- The script preserves all 34 original journal rows and all application data.
-- It runs 0037 and 0038, then records 0039 as an alias of already-applied SQL.
-- It does NOT replay 0032-0036 or the check-in ALTER TABLE from 0039.
-- It leaves 0040+ for normal drizzle-kit migrate and static seeding.
-- Fails closed if the audited schema/journal has changed or RSVPs now exist.
-- It is deliberately one-shot: a second execution fails without changing data.
-- Run the entire file with psql -X -v ON_ERROR_STOP=1 -f <this file>.
-- PostgreSQL sequences can advance on an aborted transaction; ID gaps are benign.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE drizzle.journal, public.events, public.event_rsvp_waves,
  public.event_rsvp_responses, public.rsvp_statuses, public.check_ins
  IN ACCESS EXCLUSIVE MODE;

CREATE FUNCTION pg_temp.migration_structure_fingerprint(section text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE result text;
BEGIN
  IF section = 'columns' THEN
    SELECT md5(string_agg(concat_ws('|', n.nspname, c.relname, a.attname,
      format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
      coalesce(pg_get_expr(d.adbin, d.adrelid), '<NULL>'),
      a.attidentity::text, a.attgenerated::text), E'\n'
      ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C", a.attname COLLATE "C"))
    INTO result
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname IN ('public', 'authz') AND c.relkind IN ('r', 'p')
      AND a.attnum > 0 AND NOT a.attisdropped;
  ELSIF section = 'constraints' THEN
    -- PostgreSQL 18 exposes NOT NULL constraints here; PostgreSQL 17 does not.
    -- Nullability is already included in the columns fingerprint.
    SELECT md5(string_agg(concat_ws('|', n.nspname, c.relname, k.conname,
      k.contype::text, k.convalidated::text, pg_get_constraintdef(k.oid, true)), E'\n'
      ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C", k.conname COLLATE "C"))
    INTO result
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'authz') AND k.contype <> 'n';
  ELSIF section = 'indexes' THEN
    SELECT md5(string_agg(concat_ws('|', n.nspname, t.relname, c.relname,
      i.indisvalid::text, i.indisready::text, pg_get_indexdef(i.indexrelid)), E'\n'
      ORDER BY n.nspname COLLATE "C", t.relname COLLATE "C", c.relname COLLATE "C"))
    INTO result
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname IN ('public', 'authz');
  ELSE
    RAISE EXCEPTION 'Unknown fingerprint section %', section;
  END IF;
  RETURN result;
END $$;
DO $$
BEGIN
  IF (SELECT md5(string_agg(id::text || ':' || hash || ':' || created_at::text, ';' ORDER BY id)) FROM drizzle.journal) IS DISTINCT FROM '51fb470d7dacf27d1361408dc8775167' THEN
    RAISE EXCEPTION 'Journal differs from audited 34-row production history; stop and re-audit';
  END IF;
  IF pg_temp.migration_structure_fingerprint('columns') IS DISTINCT FROM '29aa2b1bd582a8653a05e92fea6ceef3' THEN
    RAISE EXCEPTION 'Production columns differ from audit; stop and re-audit';
  END IF;
  IF pg_temp.migration_structure_fingerprint('indexes') IS DISTINCT FROM '4616dc30ced86e2c5b404fbbb7f88e2c' THEN
    RAISE EXCEPTION 'Production indexes differ from audit; stop and re-audit';
  END IF;
  IF pg_temp.migration_structure_fingerprint('constraints') IS DISTINCT FROM '6258383e5ff1347b3c6b4c74b8e5303a' THEN
    RAISE EXCEPTION 'Production constraints differ from audit; stop and re-audit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_rsvp_waves)
     OR EXISTS (SELECT 1 FROM public.event_rsvp_responses) THEN
    RAISE EXCEPTION 'RSVP data now exists; legacy deadlines/delivery need a reviewed policy';
  END IF;
  IF (SELECT array_agg(label::text ORDER BY label COLLATE "C") FROM public.rsvp_statuses)
     IS DISTINCT FROM ARRAY['accepted', 'declined', 'pending', 'timed_out']::text[] THEN
    RAISE EXCEPTION 'Unexpected RSVP lookup values; stop and re-audit';
  END IF;
END $$;

-- Exact statements from 0037_rsvp_status_display_and_invitation_email.sql (SHA-256 47af6b3cbbdc83a3f68f7e72246edc18a480dc7c0879adc9d359ed8d301d49d7).
ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_status" text DEFAULT 'unsent' NOT NULL;

ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_attempts" smallint DEFAULT 0 NOT NULL;

ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_last_error" text;

ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_queued_at" timestamp with time zone;

ALTER TABLE "event_rsvp_responses" ADD COLUMN "invitation_email_sent_at" timestamp with time zone;

CREATE INDEX "idx_event_rsvp_responses_invitation_email_status" ON "event_rsvp_responses" USING btree ("invitation_email_status");

-- rsvp_statuses is already seeded, so the display columns are added nullable,
-- backfilled, then tightened to NOT NULL to match the schema.
ALTER TABLE "rsvp_statuses" ADD COLUMN "title" varchar(100);

ALTER TABLE "rsvp_statuses" ADD COLUMN "description" varchar(500);

ALTER TABLE "rsvp_statuses" ADD COLUMN "variant" varchar(20);

ALTER TABLE "rsvp_statuses" ADD COLUMN "is_final" boolean;

UPDATE "rsvp_statuses" SET "title" = 'RSVP Invited', "description" = 'You''ve been invited to attend! Please respond before the deadline.', "variant" = 'default', "is_final" = false WHERE "label" = 'pending';

UPDATE "rsvp_statuses" SET "title" = 'RSVP Accepted', "description" = 'You''ve confirmed your attendance. See you there!', "variant" = 'success', "is_final" = true WHERE "label" = 'accepted';

UPDATE "rsvp_statuses" SET "title" = 'RSVP Declined', "description" = 'You''ve declined the invitation.', "variant" = 'destructive', "is_final" = true WHERE "label" = 'declined';

UPDATE "rsvp_statuses" SET "title" = 'RSVP Expired', "description" = 'The RSVP deadline has passed without a response.', "variant" = 'secondary', "is_final" = true WHERE "label" = 'timed_out';

ALTER TABLE "rsvp_statuses" ALTER COLUMN "title" SET NOT NULL;

ALTER TABLE "rsvp_statuses" ALTER COLUMN "description" SET NOT NULL;

ALTER TABLE "rsvp_statuses" ALTER COLUMN "variant" SET NOT NULL;

ALTER TABLE "rsvp_statuses" ALTER COLUMN "is_final" SET NOT NULL;

-- Every wave must have a deadline. Fails if any respond_by is NULL (no
-- backfill — inspect those rows by hand).
ALTER TABLE "event_rsvp_waves" ALTER COLUMN "respond_by" SET NOT NULL;


-- Exact statements from 0038_rsvp_response_window_hours.sql (SHA-256 5898653bc067abab08a2ed798022a435d06e4ed0118e0632bb14b1d36c56794f).
ALTER TABLE "events" ADD COLUMN "rsvp_response_window_hours" integer DEFAULT 48 NOT NULL;

DO $$
BEGIN
  IF pg_temp.migration_structure_fingerprint('columns') IS DISTINCT FROM '0c7a250da7e8db9094140e5e5e02fcb8' THEN
    RAISE EXCEPTION 'Post-repair columns do not match checkpoint 0039';
  END IF;
  IF pg_temp.migration_structure_fingerprint('indexes') IS DISTINCT FROM '6f4c3c782a8a11aa352b1d4b616b2902' THEN
    RAISE EXCEPTION 'Post-repair indexes do not match checkpoint 0039';
  END IF;
  IF pg_temp.migration_structure_fingerprint('constraints') IS DISTINCT FROM '6258383e5ff1347b3c6b4c74b8e5303a' THEN
    RAISE EXCEPTION 'Post-repair constraints do not match checkpoint 0039';
  END IF;
END $$;

-- Append only. The duplicate SQL hash for 0039 is intentional: its DDL
-- was applied at 1789371869814; this row acknowledges the renamed checkpoint.
-- Never edit the original hash/timestamp or stamp later, unapplied migrations.
INSERT INTO drizzle.journal (hash, created_at) VALUES
  ('47af6b3cbbdc83a3f68f7e72246edc18a480dc7c0879adc9d359ed8d301d49d7', 1788900844866),
  ('5898653bc067abab08a2ed798022a435d06e4ed0118e0632bb14b1d36c56794f', 1789501394195),
  ('342b6e59065fd66c44adcc0d7efc1b0993cc1a12ed5d634579a603259f0d2bf3', 1789501394196);

DO $$
BEGIN
  IF (SELECT count(*) FROM drizzle.journal) <> 37
     OR (SELECT max(created_at) FROM drizzle.journal) <> 1789501394196 THEN
    RAISE EXCEPTION 'Unexpected reconciled journal';
  END IF;
END $$;

DROP FUNCTION pg_temp.migration_structure_fingerprint(text);
COMMIT;
