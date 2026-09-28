import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { and, eq, inArray } from 'drizzle-orm';
import { seedDemoData } from '../../scripts/seed';
import { db } from '@/utils/db';
import {
  applicationStatuses,
  checkIns,
  eventApplications,
  eventAttendees,
  eventRsvpResponses,
  eventRsvpWaves,
  events,
  privacyAcceptances,
  rsvpStatuses,
  teamMembers,
  teams,
  termsAcceptances,
  user,
  userProfileAbout,
  userProfiles,
} from '@/db/schema';
import { userNeedsConsent } from '@/utils/consent-check';
import { createApplicationQuestionSchema } from '@/components/application-form/schema';

describe('demo seed', () => {
  let adminId: string;
  let eventId: string;
  let fixtureEventIds: string[];

  beforeAll(async () => {
    vi.stubEnv('SEED_ADMIN_EMAIL', 'seed-admin-test@example.com');
    vi.stubEnv('SEED_ADMIN_PASSWORD', 'Seed-test-password-123!');
    vi.stubEnv('SEED_ADMIN_NAME', 'Seed Test Admin');
    vi.stubEnv('SEED_COUNT', '80');
    vi.stubEnv('SEED_CHUNK_SIZE', '13');
    // These are disposable demo fixtures in the dedicated test database.
    await db
      .delete(events)
      .where(
        inArray(events.name, ['MRUHacks 2026', 'Intro to React Workshop']),
      );
    faker.seed(2026);
    await seedDemoData();
    const [admin] = await db
      .select()
      .from(user)
      .where(eq(user.email, 'seed-admin-test@example.com'));
    adminId = admin.id;
    const fixtureEvents = await db
      .select()
      .from(events)
      .where(
        inArray(events.name, ['MRUHacks 2026', 'Intro to React Workshop']),
      );
    fixtureEventIds = fixtureEvents.map((event) => event.id);
    eventId = fixtureEvents.find((event) => event.hasApplication)!.id;
  }, 30_000);

  afterAll(async () => {
    if (fixtureEventIds)
      await db.delete(events).where(inArray(events.id, fixtureEventIds));
    vi.unstubAllEnvs();
  });

  test('completes the admin welcome requirements and event participation', async () => {
    expect(await userNeedsConsent(adminId)).toBe(false);
    const [admin] = await db.select().from(user).where(eq(user.id, adminId));
    expect(admin.emailVerified).toBe(true);
    expect(admin.onboardingCompletedAt).toBeInstanceOf(Date);
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, adminId));
    const [about] = await db
      .select()
      .from(userProfileAbout)
      .where(eq(userProfileAbout.userId, adminId));
    expect(profile.fullName).toBe('Seed Test Admin');
    expect(about.universityId).toBeTypeOf('number');
    expect(about.majorId).toBeTypeOf('number');
    expect(about.yearOfStudyId).toBeTypeOf('number');
    const [application] = await db
      .select()
      .from(eventApplications)
      .where(
        and(
          eq(eventApplications.userId, adminId),
          eq(eventApplications.eventId, eventId),
        ),
      );
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));
    for (const question of event.applicationQuestions.filter(
      (question) => question.active && question.type !== 'section_divider',
    )) {
      expect(
        createApplicationQuestionSchema(question).safeParse(
          application.responses?.[question.id],
        ).success,
      ).toBe(true);
    }
    expect(
      await db
        .select()
        .from(eventAttendees)
        .where(eq(eventAttendees.userId, adminId)),
    ).toHaveLength(2);
    expect(
      await db.select().from(checkIns).where(eq(checkIns.userId, adminId)),
    ).toHaveLength(2);
    expect(
      await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.userId, adminId)),
    ).toHaveLength(1);
  });

  test('links RSVP states, approvals, attendance, and timestamps consistently across chunks', async () => {
    const responses = await db
      .select({
        response: eventRsvpResponses,
        wave: eventRsvpWaves,
        status: rsvpStatuses.label,
        applicationStatus: applicationStatuses.label,
        reviewedAt: eventApplications.reviewedAt,
      })
      .from(eventRsvpResponses)
      .innerJoin(
        eventRsvpWaves,
        eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
      )
      .innerJoin(rsvpStatuses, eq(eventRsvpResponses.statusId, rsvpStatuses.id))
      .innerJoin(
        eventApplications,
        and(
          eq(eventApplications.userId, eventRsvpResponses.userId),
          eq(eventApplications.eventId, eventRsvpWaves.eventId),
        ),
      )
      .innerJoin(
        applicationStatuses,
        eq(applicationStatuses.id, eventApplications.statusId),
      )
      .where(eq(eventRsvpWaves.eventId, eventId));
    expect(new Set(responses.map((row) => row.status))).toEqual(
      new Set(['accepted', 'pending', 'declined', 'timed_out']),
    );
    const attendees = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, eventId));
    expect(new Set(attendees.map((row) => row.userId))).toEqual(
      new Set(
        responses
          .filter((row) => row.status === 'accepted')
          .map((row) => row.response.userId),
      ),
    );
    const waves = await db
      .select()
      .from(eventRsvpWaves)
      .where(eq(eventRsvpWaves.eventId, eventId));
    expect(waves).toHaveLength(2);
    for (const row of responses) {
      expect(row.applicationStatus).toBe('approved');
      expect(row.response.invitationEmailStatus).toBe('legacy');
      expect(row.reviewedAt!.getTime()).toBeLessThanOrEqual(
        row.wave.createdAt.getTime(),
      );
      if (row.status === 'pending')
        expect(row.wave.respondBy.getTime()).toBeGreaterThan(Date.now());
      if (row.status === 'timed_out')
        expect(row.wave.respondBy.getTime()).toBeLessThan(Date.now());
      if (row.response.respondedAt) {
        expect(row.response.respondedAt.getTime()).toBeGreaterThanOrEqual(
          row.response.createdAt.getTime(),
        );
        expect(row.response.respondedAt.getTime()).toBeLessThanOrEqual(
          row.wave.respondBy.getTime(),
        );
      }
    }
    const approved = await db
      .select()
      .from(eventApplications)
      .innerJoin(
        applicationStatuses,
        eq(eventApplications.statusId, applicationStatuses.id),
      )
      .where(
        and(
          eq(eventApplications.eventId, eventId),
          eq(applicationStatuses.label, 'approved'),
        ),
      );
    expect(approved.length).toBeGreaterThan(responses.length);
    const allAttendees = await db
      .select()
      .from(eventAttendees)
      .where(inArray(eventAttendees.eventId, fixtureEventIds));
    const checkins = await db
      .select()
      .from(checkIns)
      .where(inArray(checkIns.eventId, fixtureEventIds));
    expect(checkins.length).toBeGreaterThan(2);
    expect(checkins.length).toBeLessThan(allAttendees.length);
    for (const checkin of checkins) {
      const attendee = allAttendees.find(
        (row) =>
          row.eventId === checkin.eventId && row.userId === checkin.userId,
      );
      expect(attendee).toBeDefined();
      expect(checkin.checkedInAt.getTime()).toBeGreaterThanOrEqual(
        attendee!.registeredAt.getTime(),
      );
      expect(checkin.checkedInBy).toBe(adminId);
    }
  });

  test('seeds valid team rosters, including their organizers and size limits', async () => {
    const seededTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.eventId, eventId));
    const members = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.eventId, eventId));
    expect(seededTeams.length).toBeGreaterThan(1);
    expect(new Set(members.map((member) => member.userId)).size).toBe(
      members.length,
    );
    for (const team of seededTeams) {
      const roster = members.filter((member) => member.teamId === team.id);
      expect(roster.length).toBeGreaterThan(0);
      expect(roster.length).toBeLessThanOrEqual(5);
      expect(roster.some((member) => member.userId === team.organizerId)).toBe(
        true,
      );
      expect(team.code).toMatch(/^[A-Z0-9]{8}$/);
    }
    expect(
      seededTeams.some(
        (team) =>
          members.filter((member) => member.teamId === team.id).length === 5,
      ),
    ).toBe(true);
  });

  test('can rerun with zero fake users without duplicating admin records or overwriting profile edits', async () => {
    await db
      .update(userProfiles)
      .set({ fullName: 'Edited Admin' })
      .where(eq(userProfiles.userId, adminId));
    const beforeWaves = await db
      .select()
      .from(eventRsvpWaves)
      .where(eq(eventRsvpWaves.eventId, eventId));
    vi.stubEnv('SEED_COUNT', '0');
    await seedDemoData();
    expect(
      await db
        .select()
        .from(termsAcceptances)
        .where(eq(termsAcceptances.userId, adminId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(privacyAcceptances)
        .where(eq(privacyAcceptances.userId, adminId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.userId, adminId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.userId, adminId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventId)),
    ).toHaveLength(beforeWaves.length);
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, adminId));
    expect(profile.fullName).toBe('Edited Admin');
    expect(await userNeedsConsent(adminId)).toBe(false);
  });
});
