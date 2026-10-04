import 'dotenv/config';

import { eq, inArray, or } from 'drizzle-orm';
import { client, db } from '@/utils/db';
import {
  checkIns,
  eventParticipants,
  events,
  eventRsvpWaves,
} from '@/db/schema';
import { statusIdOf } from '@/lib/participation/server';
import { isEventUuid } from '@/lib/event-slug';

const USAGE = `
Usage:
  pnpm event:reset [-- <eventId>]

Arguments:
  eventId    UUID or slug of a single event to reset. Omit to reset every
             event that requires an application.

Puts the event back to before review started: deletes all of its
event_rsvp_waves (which cascades to their event_invitations), moves every
participant, whatever their status, back to "under review" (pending_review),
and deletes every check-in for the event and its sub-events (meals,
workshops). application_votes and teams/team_members are untouched.

Only events that require an application can be reset: without one there is
no review to go back to.

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

  // pnpm forwards the `--` in `pnpm event:reset -- <id>`; skip it.
  const arg = process.argv
    .slice(2)
    .find((a) => a !== '--')
    ?.trim();

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
        `Event ${eventId} doesn't require an application, so it has no review to reset.`,
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

  const { deletedWaves, deletedCheckIns, resetCount } = await db.transaction(
    async (tx) => {
      const deleted = await tx
        .delete(eventRsvpWaves)
        .where(inArray(eventRsvpWaves.eventId, eventIds))
        .returning({ id: eventRsvpWaves.id });

      // The event's own door check-ins plus its sub-events' (meals, workshops).
      const subEvents = tx
        .select({ id: events.id })
        .from(events)
        .where(inArray(events.parentEventId, eventIds));
      const checkInsDeleted = await tx
        .delete(checkIns)
        .where(
          or(
            inArray(checkIns.eventId, eventIds),
            inArray(checkIns.eventId, subEvents),
          ),
        )
        .returning({ userId: checkIns.userId });

      const reset = await tx
        .update(eventParticipants)
        .set({
          statusId: statusIdOf('pending_review'),
          reviewedAt: null,
          reviewedBy: null,
        })
        .where(inArray(eventParticipants.eventId, eventIds))
        .returning({ id: eventParticipants.id });

      return {
        deletedWaves: deleted.length,
        deletedCheckIns: checkInsDeleted.length,
        resetCount: reset.length,
      };
    },
  );

  console.log(
    arg
      ? `Reset event ${eventIds[0]}.`
      : `Reset ${eventIds.length} application event${eventIds.length === 1 ? '' : 's'}.`,
  );
  console.log(`  Waves deleted (with their invitations): ${deletedWaves}`);
  console.log(`  Check-ins deleted: ${deletedCheckIns}`);
  console.log(`  Participants moved back to under review: ${resetCount}`);
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
