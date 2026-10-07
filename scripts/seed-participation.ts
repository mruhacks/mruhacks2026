import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  checkIns,
  eventInvitations,
  eventParticipants,
  eventRsvpWaves,
  events,
  participationStatuses,
  teamMembers,
  teams,
} from '@/db/schema';
import { canFormTeam, resolveStoredStatus } from '@/lib/participation/status';
import { generateTeamCode } from '@/lib/team-code';
import { db } from '@/utils/db';

const DAY = 86_400_000;

/** One seeder per run: all chunks share the same two demonstration waves. */
export function createParticipationSeeder(now: Date, adminId?: string) {
  const waves = new Map<string, typeof eventRsvpWaves.$inferSelect>();
  const teamIndexes = new Map<string, number>();
  let participantIndex = 0;

  return async function seedParticipation(eventId: string, userIds: string[]) {
    if (userIds.length === 0) return;

    await db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(events)
        .where(eq(events.id, eventId));
      if (!event) throw new Error(`Missing seed event ${eventId}`);
      const statuses = await tx.select().from(participationStatuses);
      const statusId = (label: string) => {
        const status = statuses.find((row) => row.label === label);
        if (!status) throw new Error(`Missing participation status ${label}`);
        return status.id;
      };
      const participants = await tx
        .select({
          id: eventParticipants.id,
          userId: eventParticipants.userId,
          status: participationStatuses.label,
        })
        .from(eventParticipants)
        .innerJoin(
          participationStatuses,
          eq(eventParticipants.statusId, participationStatuses.id),
        )
        .where(
          and(
            eq(eventParticipants.eventId, eventId),
            inArray(eventParticipants.userId, userIds),
          ),
        )
        .orderBy(asc(eventParticipants.createdAt), asc(eventParticipants.id));
      const attending = await tx
        .select({ userId: eventParticipants.userId })
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, eventId),
            eq(eventParticipants.statusId, statusId('accepted')),
          ),
        );
      const registered = new Set(attending.map((row) => row.userId));
      let spots =
        event.capacity === null
          ? Infinity
          : Math.max(0, event.capacity - attending.length);

      for (const application of participants) {
        // Only the waitlist goes out in a wave; anyone already invited has
        // moved off it.
        if (application.status !== 'waitlisted') continue;
        // Accepted, open, declined, expired, and still eligible for a future wave.
        const scenario =
          application.userId === adminId ? 0 : participantIndex++ % 8;
        if (scenario === 7 || spots <= 0) continue;
        const label =
          scenario < 4
            ? 'accepted'
            : scenario === 4
              ? 'invited'
              : scenario === 5
                ? 'declined'
                : 'timed_out';
        const expired = label === 'timed_out';
        const key = `${eventId}:${expired ? 'expired' : 'open'}`;
        let wave = waves.get(key);
        if (!wave) {
          const [latest] = await tx
            .select({ wave: eventRsvpWaves.wave })
            .from(eventRsvpWaves)
            .where(eq(eventRsvpWaves.eventId, eventId))
            .orderBy(desc(eventRsvpWaves.wave))
            .limit(1);
          const inserted = await tx
            .insert(eventRsvpWaves)
            .values([
              {
                eventId,
                wave: (latest?.wave ?? 0) + 1,
                createdAt: new Date(now.getTime() - 6 * DAY),
                respondBy: new Date(now.getTime() - 3 * DAY),
              },
              {
                eventId,
                wave: (latest?.wave ?? 0) + 2,
                createdAt: new Date(now.getTime() - 2 * DAY),
                respondBy: new Date(now.getTime() + 5 * DAY),
              },
            ])
            .returning();
          waves.set(`${eventId}:expired`, inserted[0]);
          waves.set(`${eventId}:open`, inserted[1]);
          wave = waves.get(key)!;
        }
        const respondedAt =
          label === 'accepted' || label === 'declined'
            ? new Date(now.getTime() - DAY)
            : null;
        await tx
          .update(eventParticipants)
          .set({ statusId: statusId(label) })
          .where(eq(eventParticipants.id, application.id));
        await tx.insert(eventInvitations).values({
          rsvpWaveId: wave.id,
          participantId: application.id,
          respondedAt,
          termsAcceptedAt:
            label === 'accepted' && event.termsId ? respondedAt : null,
          acceptedTermsId: label === 'accepted' ? event.termsId : null,
          // Synthetic history: never enqueue mail for seeded invitations.
          invitationEmailStatus: 'legacy',
          createdAt: wave.createdAt,
          updatedAt: expired ? wave.respondBy : (respondedAt ?? wave.createdAt),
        });
        if (label === 'accepted') {
          registered.add(application.userId);
          spots--;
        }
        application.status = label;
      }

      // Only confirmed attendees get check-ins; leave some available for scanning.
      const eligibleAttendees = userIds.filter((id) => registered.has(id));
      const checkinRows = eligibleAttendees
        .filter((id, index) => id === adminId || index % 3 !== 2)
        .map((userId, index) => ({
          userId,
          eventId,
          checkedInBy: adminId ?? null,
          checkedInAt: new Date(now.getTime() - (index % 60) * 60_000),
        }));
      if (checkinRows.length)
        await tx.insert(checkIns).values(checkinRows).onConflictDoNothing();

      if (!event.teamsEnabled) return;
      const memberships = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.eventId, eventId),
            inArray(teamMembers.userId, userIds),
          ),
        );
      const alreadyOnTeam = new Set(memberships.map((row) => row.userId));
      const eligible = new Set([
        ...participants
          .filter((row) => canFormTeam(resolveStoredStatus(row.status)))
          .map((row) => row.userId),
        ...eligibleAttendees,
      ]);
      const members = userIds.filter(
        (id) => eligible.has(id) && !alreadyOnTeam.has(id),
      );
      const maxSize = Math.max(1, event.maxTeamSize ?? 5);
      let teamIndex = teamIndexes.get(eventId) ?? 0;
      while (members.length) {
        // Include solo, partially filled, and full teams.
        const roster = members.splice(0, 1 + (teamIndex++ % maxSize));
        const [team] = await tx
          .insert(teams)
          .values({
            eventId,
            organizerId: roster[0],
            code: await generateTeamCode(eventId, tx),
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await tx.insert(teamMembers).values(
          roster.map((userId) => ({
            teamId: team.id,
            eventId,
            userId,
            joinedAt: now,
          })),
        );
      }
      teamIndexes.set(eventId, teamIndex);
    });
  };
}
