import 'dotenv/config';

import { eq, inArray, sql } from 'drizzle-orm';
import { client, db } from '@/utils/db';
import { events, eventRsvpWaves } from '@/db/schema';
import { isEventUuid } from '@/lib/event-slug';

const USAGE = `
Usage:
  pnpm event:reset [-- <eventId>]

Arguments:
  eventId    UUID or slug of a single event to reset. Omit to reset every
             event that requires an application.

Puts the event back to before any RSVP wave went out: deletes all of its
event_rsvp_waves (which cascades to their event_invitations) and moves every
participant, whatever their status, onto the waitlist in application order
(oldest first). check_ins and teams/team_members are untouched.

Only events that require an application can be reset: without one there is
no waitlist and no waves.

Examples:
  pnpm event:reset
  pnpm event:reset -- 123e4567-e89b-12d3-a456-426614174000
  pnpm event:reset -- mruhacks-2026
`.trim();

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run: this script resets participant statuses.');
    console.error('It is disabled when NODE_ENV=production.');
    process.exit(1);
  }
}

async function resolveEventId(segment: string): Promise<string | null> {
  if (isEventUuid(segment)) {
    const [row] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, segment))
      .limit(1);
    return row?.id ?? null;
  }

  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, segment))
    .limit(1);
  return row?.id ?? null;
}

async function main(): Promise<void> {
  assertNotProduction();

  const arg = process.argv[2]?.trim();

  let eventIds: string[];
  if (arg) {
    const eventId = await resolveEventId(arg);
    if (!eventId) {
      console.error(`No event found matching "${arg}".\n`);
      console.error(USAGE);
      process.exitCode = 1;
      return;
    }
    const [event] = await db
      .select({ hasApplication: events.hasApplication })
      .from(events)
      .where(eq(events.id, eventId));
    if (!event.hasApplication) {
      console.error(
        `Event ${eventId} doesn't require an application, so it has no waitlist to reset.`,
      );
      process.exitCode = 1;
      return;
    }
    eventIds = [eventId];
  } else {
    const rows = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.hasApplication, true));
    eventIds = rows.map((row) => row.id);
  }

  if (eventIds.length === 0) {
    console.log('No events require an application. Nothing to reset.');
    return;
  }

  const { deletedWaves, resetCount } = await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(eventRsvpWaves)
      .where(inArray(eventRsvpWaves.eventId, eventIds))
      .returning({ id: eventRsvpWaves.id });

    const ids = sql.join(
      eventIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const reset = await tx.execute(sql`
      UPDATE event_participants AS p
      SET
        status_id = (
          SELECT id FROM participation_statuses WHERE label = 'waitlisted'
        ),
        waitlist_position = ranked.position,
        updated_at = now()
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY event_id ORDER BY created_at, id
          ) AS position
        FROM event_participants
        WHERE event_id IN (${ids})
      ) AS ranked
      WHERE p.id = ranked.id
      RETURNING p.id
    `);

    return { deletedWaves: deleted.length, resetCount: reset.length };
  });

  console.log(
    arg
      ? `Reset event ${eventIds[0]}.`
      : `Reset ${eventIds.length} application event${eventIds.length === 1 ? '' : 's'}.`,
  );
  console.log(`  Waves deleted (with their invitations): ${deletedWaves}`);
  console.log(`  Participants moved to the waitlist: ${resetCount}`);
}

main()
  .catch((error) => {
    console.error('Unexpected error while resetting event:');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
