import { generateParticipantPass } from '@/lib/wallet/generate-pass';
import { getEventParticipation } from '@/lib/wallet/participation';
import { getUser } from '@/utils/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { eventId } = await params;
  const participation = await getEventParticipation(eventId, user.id);
  if (!participation) return new Response('Not found', { status: 404 });
  if (!participation.isParticipant) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const pass = await generateParticipantPass({
      eventId,
      userId: user.id,
      name: participation.fullName ?? user.name,
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
