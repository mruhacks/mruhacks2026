import { generateParticipantPass } from '@/lib/wallet/generate-pass';
import {
  getEventParticipation,
  resolveParticipantName,
} from '@/lib/wallet/participation';
import { checkWalletRateLimit } from '@/lib/wallet/rate-limit';
import { getUser } from '@/utils/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!(await checkWalletRateLimit(user.id))) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const { eventId } = await params;
  const participation = await getEventParticipation(eventId, user.id);
  // Not-participant collapses into the same 404 as "no application at all"
  // rather than a 403, so this endpoint can't be used to probe whether a
  // given user has applied to a given event.
  if (!participation || !participation.isParticipant) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const pass = await generateParticipantPass({
      eventId,
      userId: user.id,
      name: resolveParticipantName(participation.fullName, user.name),
      role: 'Participant',
      eventName: participation.eventName,
      startsAt: participation.startsAt,
      endsAt: participation.endsAt,
      location: participation.location,
      latitude: participation.latitude,
      longitude: participation.longitude,
      radiusMeters: participation.radiusMeters,
      expiresAt: participation.endsAt,
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
