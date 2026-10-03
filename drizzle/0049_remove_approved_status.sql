-- Remove the `approved` participation status. Accepting an application now
-- puts it on the waitlist, and RSVP waves invite only from the waitlist in
-- `waitlist_position` order.
--
-- Waves used to invite every `approved` participant before anyone
-- `waitlisted`, so existing approved participants go to the FRONT of their
-- event's waitlist (oldest application first) and the existing queue shifts back
-- behind them. The next wave then invites the same people in the same order
-- it would have before.

-- 1. Shift the existing waitlist back by the number of approved participants.
UPDATE "event_participants" AS p
SET "waitlist_position" = p."waitlist_position" + shift.approved_count
FROM (
  SELECT ep."event_id", COUNT(*) AS approved_count
  FROM "event_participants" AS ep
  JOIN "participation_statuses" AS ps ON ps."id" = ep."status_id"
  WHERE ps."label" = 'approved'
  GROUP BY ep."event_id"
) AS shift
WHERE p."event_id" = shift."event_id"
  AND p."waitlist_position" IS NOT NULL
  AND p."status_id" = (
    SELECT "id" FROM "participation_statuses" WHERE "label" = 'waitlisted'
  );
--> statement-breakpoint

-- 2. Approved participants take positions 1..n, in the order waves invited them.
UPDATE "event_participants" AS p
SET
  "status_id" = (
    SELECT "id" FROM "participation_statuses" WHERE "label" = 'waitlisted'
  ),
  "waitlist_position" = ranked.position
FROM (
  SELECT
    ep."id",
    ROW_NUMBER() OVER (
      PARTITION BY ep."event_id"
      ORDER BY ep."created_at", ep."id"
    ) AS position
  FROM "event_participants" AS ep
  JOIN "participation_statuses" AS ps ON ps."id" = ep."status_id"
  WHERE ps."label" = 'approved'
) AS ranked
WHERE p."id" = ranked."id";
--> statement-breakpoint

DELETE FROM "participation_statuses" WHERE "label" = 'approved';
