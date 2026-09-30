import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  applicationStatuses,
  checkIns,
  eventApplications,
  eventAttendees,
  eventRsvpResponses,
  eventRsvpWaves,
  events,
  rsvpStatuses,
  teamMembers,
  teams,
} from '@/db/schema';
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
      const statuses = await tx.select().from(rsvpStatuses);
      const applications = await tx
        .select({
          userId: eventApplications.userId,
          status: applicationStatuses.label,
        })
        .from(eventApplications)
        .leftJoin(
          applicationStatuses,
          eq(eventApplications.statusId, applicationStatuses.id),
        )
        .where(
          and(
            eq(eventApplications.eventId, eventId),
            inArray(eventApplications.userId, userIds),
          ),
        )
        .orderBy(asc(eventApplications.createdAt), asc(eventApplications.id));
      const existingResponses = await tx
        .select({ userId: eventRsvpResponses.userId })
        .from(eventRsvpResponses)
        .innerJoin(
          eventRsvpWaves,
          eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
        )
        .where(
          and(
            eq(eventRsvpWaves.eventId, eventId),
            inArray(eventRsvpResponses.userId, userIds),
          ),
        );
      const invited = new Set(existingResponses.map((row) => row.userId));
      const attendees = await tx
        .select()
        .from(eventAttendees)
        .where(eq(eventAttendees.eventId, eventId));
      const registered = new Set(attendees.map((row) => row.userId));
      let spots =
        event.capacity === null
          ? Infinity
          : Math.max(0, event.capacity - attendees.length);

      for (const application of applications) {
        if (
          application.status !== 'approved' ||
          invited.has(application.userId) ||
          registered.has(application.userId)
        )
          continue;
        // Accepted, open, declined, expired, and still eligible for a future wave.
        const scenario =
          application.userId === adminId ? 0 : participantIndex++ % 8;
        if (scenario === 7 || spots <= 0) continue;
        const label =
          scenario < 4
            ? 'accepted'
            : scenario === 4
              ? 'pending'
              : scenario === 5
                ? 'declined'
                : 'timed_out';
        const status = statuses.find((row) => row.label === label);
        if (!status) throw new Error(`Missing RSVP status ${label}`);
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
        await tx.insert(eventRsvpResponses).values({
          rsvpWaveId: wave.id,
          userId: application.userId,
          statusId: status.id,
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
          await tx.insert(eventAttendees).values({
            eventId,
            userId: application.userId,
            registeredAt: respondedAt!,
          });
          registered.add(application.userId);
          spots--;
        }
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
        ...applications
          .filter((row) => row.status !== 'denied')
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
