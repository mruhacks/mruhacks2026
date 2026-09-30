import 'dotenv/config';

import { eq, inArray } from 'drizzle-orm';
import { client, db } from '@/utils/db';
import { events, eventRsvpResponses, eventRsvpWaves } from '@/db/schema';
import { isEventUuid } from '@/lib/event-slug';

const USAGE = `
Usage:
  pnpm rsvp:reset [-- <eventId>]

Arguments:
  eventId    UUID or slug of a single event to reset. Omit to reset every
             event's RSVP state.

Deletes all event_rsvp_waves rows for the target event(s), which cascades to
their event_rsvp_responses. Does not touch event_attendees, check_ins, or
teams/team_members, even for attendees who only registered by accepting an
RSVP.

Examples:
  pnpm rsvp:reset
  pnpm rsvp:reset -- 123e4567-e89b-12d3-a456-426614174000
  pnpm rsvp:reset -- mruhacks-2026
`.trim();

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run: this script deletes RSVP records.');
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

  let eventIds: string[] | null = null;
  if (arg) {
    const eventId = await resolveEventId(arg);
    if (!eventId) {
      console.error(`No event found matching "${arg}".\n`);
      console.error(USAGE);
      process.exitCode = 1;
      return;
    }
    eventIds = [eventId];
  }

  const waveRows = eventIds
    ? await db
        .select({ id: eventRsvpWaves.id })
        .from(eventRsvpWaves)
        .where(inArray(eventRsvpWaves.eventId, eventIds))
    : await db.select({ id: eventRsvpWaves.id }).from(eventRsvpWaves);
  const waveIds = waveRows.map((row) => row.id);

  if (waveIds.length === 0) {
    console.log(
      eventIds
        ? 'No RSVP waves found for that event. Nothing to reset.'
        : 'No RSVP waves found. Nothing to reset.',
    );
    return;
  }

  const responseRows = await db
    .select({ id: eventRsvpResponses.id })
    .from(eventRsvpResponses)
    .where(inArray(eventRsvpResponses.rsvpWaveId, waveIds));
  const responseCount = responseRows.length;

  const deletedWaves = await db
    .delete(eventRsvpWaves)
    .where(inArray(eventRsvpWaves.id, waveIds))
    .returning({ id: eventRsvpWaves.id });

  console.log(
    eventIds
      ? `Reset RSVP state for event ${eventIds[0]}.`
      : 'Reset RSVP state for all events.',
  );
  console.log(`  Waves deleted:     ${deletedWaves.length}`);
  console.log(`  Responses deleted: ${responseCount}`);
}

main()
  .catch((error) => {
    console.error('Unexpected error while resetting RSVP state:');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
