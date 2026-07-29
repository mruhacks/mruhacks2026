import { and, eq } from 'drizzle-orm';

import {
  applicationStatuses,
  eventApplications,
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

  const [application] = await db
    .select({
      id: eventApplications.id,
      statusLabel: applicationStatuses.label,
      fullName: userProfiles.fullName,
      eventEndsAt: events.endsAt,
    })
    .from(eventApplications)
    .innerJoin(events, eq(events.id, eventApplications.eventId))
    .leftJoin(
      applicationStatuses,
      eq(applicationStatuses.id, eventApplications.statusId),
    )
    .leftJoin(userProfiles, eq(userProfiles.userId, eventApplications.userId))
    .where(
      and(
        eq(eventApplications.userId, user.id),
        eq(eventApplications.eventId, eventId),
      ),
    )
    .limit(1);

  if (!application) return new Response('Not found', { status: 404 });

  if (application.statusLabel !== 'approved') {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const pass = await generateParticipantPass({
      applicationId: application.id,
      name: application.fullName ?? user.name,
      role: 'Participant',
      expiresAt: application.eventEndsAt,
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
