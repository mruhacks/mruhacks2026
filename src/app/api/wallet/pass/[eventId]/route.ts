import { and, eq, isNull } from 'drizzle-orm';

import {
  applicationStatuses,
  eventApplications,
  eventAttendees,
  events,
  userProfiles,
} from '@/db/schema';
import { generateParticipantPass } from '@/lib/wallet/generate-pass';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { eventId } = await params;
  if (!UUID_PATTERN.test(eventId)) {
    return new Response('Not found', { status: 404 });
  }

  const [row] = await db
    .select({
      endsAt: events.endsAt,
      statusLabel: applicationStatuses.label,
      attendeeUserId: eventAttendees.userId,
      fullName: userProfiles.fullName,
    })
    .from(events)
    .leftJoin(
      eventApplications,
      and(
        eq(eventApplications.eventId, events.id),
        eq(eventApplications.userId, user.id),
      ),
    )
    .leftJoin(
      applicationStatuses,
      eq(applicationStatuses.id, eventApplications.statusId),
    )
    .leftJoin(
      eventAttendees,
      and(
        eq(eventAttendees.eventId, events.id),
        eq(eventAttendees.userId, user.id),
      ),
    )
    .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
    .where(and(eq(events.id, eventId), isNull(events.parentEventId)))
    .limit(1);

  if (!row) return new Response('Not found', { status: 404 });

  const isParticipant =
    row.statusLabel === 'approved' || row.attendeeUserId !== null;
  if (!isParticipant) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const pass = await generateParticipantPass({
      eventId,
      userId: user.id,
      name: row.fullName ?? user.name,
      role: 'Participant',
      expiresAt: row.endsAt,
    });

    return new Response(new Uint8Array(pass), {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': 'attachment; filename="MRUHacks.pkpass"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[wallet] failed to generate pass', error);
    return new Response('Could not generate pass', { status: 500 });
  }
}
