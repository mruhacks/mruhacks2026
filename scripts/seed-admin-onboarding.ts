import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  applicationStatuses,
  eventApplications,
  eventAttendees,
  events,
  genders,
  interests,
  majors,
  marketingConsents,
  privacyAcceptances,
  termsAcceptances,
  universities,
  user,
  userInterests,
  userProfileAbout,
  userProfiles,
  yearsOfStudy,
} from '@/db/schema';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '@/lib/consent';
import { db } from '@/utils/db';

/** Complete the seeded account using the same records the welcome gates read. */
export async function seedAdminOnboarding(
  userId: string,
  name: string,
  applicationEventId: string,
  workshopEventId: string,
  responses: Record<string, unknown>,
  now: Date,
) {
  const submittedAt = new Date(now.getTime() - 7 * 86_400_000);
  await db.transaction(async (tx) => {
    const [gender] = await tx
      .select()
      .from(genders)
      .where(eq(genders.label, 'Prefer not to say'));
    const [university] = await tx
      .select()
      .from(universities)
      .where(eq(universities.label, 'Mount Royal University'));
    const [major] = await tx
      .select()
      .from(majors)
      .where(eq(majors.label, 'Computer Science'));
    const [year] = await tx
      .select()
      .from(yearsOfStudy)
      .where(eq(yearsOfStudy.label, '3rd'));
    const [interest] = await tx
      .select()
      .from(interests)
      .where(eq(interests.label, 'Web Development'));
    const [approved] = await tx
      .select()
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, 'approved'));
    if (!gender || !university || !major || !year || !interest || !approved) {
      throw new Error('Seed static tables before completing admin onboarding.');
    }

    // Fill missing records while preserving any profile edits on subsequent runs.
    await tx
      .insert(userProfiles)
      .values({ userId, fullName: name, genderId: gender.id })
      .onConflictDoNothing();
    await tx
      .insert(userProfileAbout)
      .values({
        userId,
        universityId: university.id,
        majorId: major.id,
        yearOfStudyId: year.id,
        attendedHackathonBefore: true,
      })
      .onConflictDoNothing();
    await tx
      .insert(userInterests)
      .values({ userId, interestId: interest.id })
      .onConflictDoNothing();
    await tx
      .insert(marketingConsents)
      .values({ userId, optedIn: false, changedAt: now })
      .onConflictDoNothing();

    // Acceptance logs have no unique key on (user, version): don't append on every run.
    for (const [table, version] of [
      [termsAcceptances, CURRENT_TERMS_VERSION],
      [privacyAcceptances, CURRENT_PRIVACY_VERSION],
    ] as const) {
      const [latest] = await tx
        .select({ version: table.version })
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(desc(table.acceptedAt))
        .limit(1);
      if (latest?.version !== version) {
        await tx.insert(table).values({ userId, version, acceptedAt: now });
      }
    }

    // Include the current featured event too if it differs from the sample hackathon.
    const featured = await tx
      .select()
      .from(events)
      .where(eq(events.isFeatured, true));
    const [applicationEvent] = await tx
      .select()
      .from(events)
      .where(eq(events.id, applicationEventId));
    const onboardingEvents = new Map(
      [...featured, applicationEvent].map((event) => [event.id, event]),
    );
    for (const event of onboardingEvents.values()) {
      if (event.hasApplication) {
        await tx
          .insert(eventApplications)
          .values({
            eventId: event.id,
            userId,
            statusId: approved.id,
            responses: event.id === applicationEventId ? responses : {},
            reviewedBy: userId,
            reviewedAt: submittedAt,
            createdAt: submittedAt,
            updatedAt: submittedAt,
          })
          .onConflictDoNothing();
      } else {
        await tx
          .insert(eventAttendees)
          .values({ eventId: event.id, userId, registeredAt: submittedAt })
          .onConflictDoNothing();
      }
    }
    await tx
      .insert(eventAttendees)
      .values({ eventId: workshopEventId, userId, registeredAt: submittedAt })
      .onConflictDoNothing();
    await tx
      .update(user)
      .set({ onboardingCompletedAt: now })
      .where(and(eq(user.id, userId), isNull(user.onboardingCompletedAt)));
  });
}
