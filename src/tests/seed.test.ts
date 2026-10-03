import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { readFile } from 'node:fs/promises';
import { and, eq, inArray } from 'drizzle-orm';
import { seedDemoData } from '../../scripts/seed';
import { db } from '@/utils/db';
import {
  checkIns,
  eventParticipants,
  eventInvitations,
  participationStatuses,
  eventRsvpWaves,
  events,
  eventTerms,
  privacyAcceptances,
  teamMembers,
  teams,
  termsAcceptances,
  user,
  userProfileAbout,
  userProfiles,
} from '@/db/schema';
import { userNeedsConsent } from '@/utils/consent-check';
import { createApplicationQuestionSchema } from '@/components/application-form/schema';
import { putObject } from '@/utils/object-storage';
import { createResumeSeeder } from '../../scripts/seed-resumes';

vi.mock('@/utils/object-storage', () => ({
  putObject: vi.fn().mockResolvedValue(undefined),
}));

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

  test('seeds hackathon rules and a photo release as one shared terms version', async () => {
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));
    const [terms] = await db
      .select()
      .from(eventTerms)
      .where(eq(eventTerms.id, event.termsId!));
    expect(terms.markdown).toContain('## Hackathon rules');
    expect(terms.markdown).toContain('## Photo and video release');
    expect(
      await db.select().from(eventTerms).where(eq(eventTerms.eventId, eventId)),
    ).toHaveLength(1);
  });

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
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.userId, adminId),
          eq(eventParticipants.eventId, eventId),
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
        .from(eventParticipants)
        .innerJoin(
          participationStatuses,
          eq(eventParticipants.statusId, participationStatuses.id),
        )
        .where(
          and(
            eq(eventParticipants.userId, adminId),
            eq(participationStatuses.label, 'accepted'),
          ),
        ),
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

  test('gives every fake user an isolated copy of a committed PDF', async () => {
    const profiles = await db
      .select({ profile: userProfiles })
      .from(userProfiles)
      .innerJoin(
        eventParticipants,
        eq(eventParticipants.userId, userProfiles.userId),
      )
      .where(eq(eventParticipants.eventId, eventId));
    const fakeProfiles = profiles
      .map(({ profile }) => profile)
      .filter((profile) => profile.userId !== adminId);
    expect(fakeProfiles).toHaveLength(80);
    const uploads = vi.mocked(putObject).mock.calls.map(([upload]) => upload);
    expect(uploads).toHaveLength(80);
    expect(new Set(uploads.map(({ key }) => key)).size).toBe(80);
    const fixtureNames = new Set<string>();
    for (const profile of fakeProfiles) {
      expect(profile.resumeFile).toMatch(
        new RegExp(`^resumes/${profile.userId}/[0-9a-f-]{36}\\.pdf$`),
      );
      expect(profile.resumeFileName).toMatch(
        /^resume-(0[1-9]|1[0-9]|20)\.pdf$/,
      );
      expect(profile.resumeFileType).toBe('application/pdf');
      const upload = uploads.find(({ key }) => key === profile.resumeFile)!;
      expect(upload).toBeDefined();
      expect(upload.contentType).toBe('application/pdf');
      const fixture = await readFile(
        new URL(
          `../../scripts/fixtures/resumes/${profile.resumeFileName}`,
          import.meta.url,
        ),
      );
      expect(Buffer.from(upload.body).equals(fixture)).toBe(true);
      expect(fixture.subarray(0, 5).toString()).toBe('%PDF-');
      fixtureNames.add(profile.resumeFileName!);
    }
    expect(fixtureNames.size).toBeGreaterThan(1);
    expect(fixtureNames.size).toBeLessThanOrEqual(20);
  });

  test('propagates storage failures instead of returning a broken resume reference', async () => {
    const seedResume = await createResumeSeeder();
    vi.mocked(putObject).mockRejectedValueOnce(
      new Error('Storage unavailable'),
    );
    await expect(seedResume('test-user')).rejects.toThrow(
      'Storage unavailable',
    );
  });

  test('links RSVP states, approvals, attendance, and timestamps consistently across chunks', async () => {
    const responses = await db
      .select({
        response: eventInvitations,
        userId: eventParticipants.userId,
        wave: eventRsvpWaves,
        status: participationStatuses.label,
        reviewedAt: eventParticipants.reviewedAt,
      })
      .from(eventInvitations)
      .innerJoin(
        eventRsvpWaves,
        eq(eventInvitations.rsvpWaveId, eventRsvpWaves.id),
      )
      .innerJoin(
        eventParticipants,
        eq(eventInvitations.participantId, eventParticipants.id),
      )
      .innerJoin(
        participationStatuses,
        eq(participationStatuses.id, eventParticipants.statusId),
      )
      .where(eq(eventRsvpWaves.eventId, eventId));
    expect(new Set(responses.map((row) => row.status))).toEqual(
      new Set(['accepted', 'invited', 'declined', 'timed_out']),
    );
    // Everyone holding a spot got there by accepting an invitation.
    const attendees = await db
      .select({ userId: eventParticipants.userId })
      .from(eventParticipants)
      .innerJoin(
        participationStatuses,
        eq(participationStatuses.id, eventParticipants.statusId),
      )
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(participationStatuses.label, 'accepted'),
        ),
      );
    expect(new Set(attendees.map((row) => row.userId))).toEqual(
      new Set(
        responses
          .filter((row) => row.status === 'accepted')
          .map((row) => row.userId),
      ),
    );
    const waves = await db
      .select()
      .from(eventRsvpWaves)
      .where(eq(eventRsvpWaves.eventId, eventId));
    expect(waves).toHaveLength(2);
    for (const row of responses) {
      expect(row.reviewedAt).not.toBeNull();
      if (row.status === 'accepted') {
        expect(row.response.acceptedTermsId).toBeTruthy();
        expect(row.response.termsAcceptedAt).toEqual(row.response.respondedAt);
      } else {
        expect(row.response.acceptedTermsId).toBeNull();
        expect(row.response.termsAcceptedAt).toBeNull();
      }
      expect(row.response.invitationEmailStatus).toBe('legacy');
      expect(row.reviewedAt!.getTime()).toBeLessThanOrEqual(
        row.wave.createdAt.getTime(),
      );
      if (row.status === 'invited')
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
    // Some waitlisted applicants are left for a future wave.
    const waitlisted = await db
      .select()
      .from(eventParticipants)
      .innerJoin(
        participationStatuses,
        eq(eventParticipants.statusId, participationStatuses.id),
      )
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(participationStatuses.label, 'waitlisted'),
        ),
      );
    expect(waitlisted.length).toBeGreaterThan(0);
    const allAttendees = (
      await db
        .select({ participant: eventParticipants })
        .from(eventParticipants)
        .innerJoin(
          participationStatuses,
          eq(eventParticipants.statusId, participationStatuses.id),
        )
        .where(
          and(
            inArray(eventParticipants.eventId, fixtureEventIds),
            eq(participationStatuses.label, 'accepted'),
          ),
        )
    ).map((row) => row.participant);
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
        attendee!.createdAt.getTime(),
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
    const uploadCount = vi.mocked(putObject).mock.calls.length;
    await seedDemoData();
    expect(putObject).toHaveBeenCalledTimes(uploadCount);
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
        .from(eventInvitations)
        .innerJoin(
          eventParticipants,
          eq(eventInvitations.participantId, eventParticipants.id),
        )
        .where(eq(eventParticipants.userId, adminId)),
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
