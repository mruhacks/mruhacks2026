/**
 * Server actions for the Account & Privacy dashboard section.
 *
 * These back the data-subject rights required by Canadian privacy law
 * (PIPEDA / Alberta PIPA) and the GDPR:
 *   - Right to access / portability  → exportMyData()
 *   - Consent management             → getConsent() / setMarketingConsent()
 *   - Account overview               → getAccountOverview()
 *
 * The right to erasure (account deletion) is handled by Better Auth's
 * email-verified `deleteUser` flow (see src/utils/auth.ts) and is invoked
 * from the client via authClient.deleteUser().
 */

'use server';

import { desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/utils/db';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '@/lib/consent';
import { userNeedsConsent } from '@/utils/consent-check';
import * as schema from '@/db/schema';

export type ConsentData = {
  marketingEmails: boolean;
  marketingConsentAt: string | null;
  /** Latest accepted Terms version + when, or null if never accepted. */
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  /** Latest accepted Privacy Policy version + when, or null if never accepted. */
  privacyVersion: string | null;
  privacyAcceptedAt: string | null;
};

export type AccountOverview = {
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  /** Auth providers linked to this account, e.g. 'credential', 'google'. */
  providers: string[];
};

/**
 * Summary of the signed-in account for the Account page header. Never exposes
 * secrets (passwords, OAuth tokens) — only the provider identifiers.
 */
export async function getAccountOverview(): Promise<ActionResult<AccountOverview>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const providerRows = await db
    .select({ providerId: schema.account.providerId })
    .from(schema.account)
    .where(eq(schema.account.userId, user.id));

  return ok({
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
    providers: providerRows.map((r) => r.providerId),
  });
}

/**
 * Returns the user's consent record: their latest Terms/Privacy acceptances
 * and current marketing preference. Defaults to an opted-out / not-accepted
 * view when no rows exist yet.
 */
export async function getConsent(): Promise<ActionResult<ConsentData>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const [[termsRow], [privacyRow], [marketingRow]] = await Promise.all([
    db
      .select()
      .from(schema.termsAcceptances)
      .where(eq(schema.termsAcceptances.userId, user.id))
      .orderBy(desc(schema.termsAcceptances.acceptedAt))
      .limit(1),
    db
      .select()
      .from(schema.privacyAcceptances)
      .where(eq(schema.privacyAcceptances.userId, user.id))
      .orderBy(desc(schema.privacyAcceptances.acceptedAt))
      .limit(1),
    db.select().from(schema.marketingConsents).where(eq(schema.marketingConsents.userId, user.id)).limit(1),
  ]);

  const optedIn = marketingRow?.optedIn ?? false;

  return ok({
    marketingEmails: optedIn,
    // Only surface a timestamp while opted in — mirrors the withdrawal-clears
    // semantics the consent UI expects.
    marketingConsentAt: optedIn && marketingRow ? marketingRow.changedAt.toISOString() : null,
    termsVersion: termsRow?.version ?? null,
    termsAcceptedAt: termsRow?.acceptedAt.toISOString() ?? null,
    privacyVersion: privacyRow?.version ?? null,
    privacyAcceptedAt: privacyRow?.acceptedAt.toISOString() ?? null,
  });
}

/**
 * Whether the user still needs to accept the current Terms of Use and/or
 * Privacy Policy. Used to gate onboarding on /welcome. True when either
 * document has never been accepted or was accepted at an older version.
 */
export async function getConsentStatus(): Promise<ActionResult<{ needsConsent: boolean }>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  return ok({ needsConsent: await userNeedsConsent(user.id) });
}

/**
 * Records the user's marketing-email consent choice with a timestamp. The
 * `changed_at` timestamp on the row is the auditable record of the most recent
 * opt-in or opt-out.
 */
export async function setMarketingConsent(optIn: boolean): Promise<ActionResult<ConsentData>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  try {
    await upsertMarketingConsent(user.id, optIn);
    return getConsent();
  } catch (error) {
    console.error('[account] failed to set marketing consent', error);
    return fail('Failed to update your preferences.');
  }
}

/**
 * Records the required legal consent (Terms of Use + Privacy Policy) at their
 * current versions, plus the optional marketing opt-in. Called during
 * first-time onboarding on /welcome. Legal acceptances are only appended when
 * the current version isn't already the user's latest acceptance, so replaying
 * the flow doesn't create duplicate rows.
 */
export async function recordOnboardingConsent(marketingOptIn: boolean): Promise<ActionResult<ConsentData>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  try {
    const [[latestTerms], [latestPrivacy]] = await Promise.all([
      db
        .select({ version: schema.termsAcceptances.version })
        .from(schema.termsAcceptances)
        .where(eq(schema.termsAcceptances.userId, user.id))
        .orderBy(desc(schema.termsAcceptances.acceptedAt))
        .limit(1),
      db
        .select({ version: schema.privacyAcceptances.version })
        .from(schema.privacyAcceptances)
        .where(eq(schema.privacyAcceptances.userId, user.id))
        .orderBy(desc(schema.privacyAcceptances.acceptedAt))
        .limit(1),
    ]);

    const writes: Promise<unknown>[] = [upsertMarketingConsent(user.id, marketingOptIn)];
    if (latestTerms?.version !== CURRENT_TERMS_VERSION) {
      writes.push(db.insert(schema.termsAcceptances).values({ userId: user.id, version: CURRENT_TERMS_VERSION }));
    }
    if (latestPrivacy?.version !== CURRENT_PRIVACY_VERSION) {
      writes.push(db.insert(schema.privacyAcceptances).values({ userId: user.id, version: CURRENT_PRIVACY_VERSION }));
    }
    await Promise.all(writes);
    revalidatePath('/welcome', 'layout');

    return getConsent();
  } catch (error) {
    console.error('[account] failed to record onboarding consent', error);
    return fail('Failed to record your consent.');
  }
}

/**
 * Marks the welcome flow complete only after both its requirements are met.
 * This persistent marker distinguishes a first-time welcome from a later
 * consent refresh without making legacy, already-complete accounts repeat it.
 */
export async function completeWelcomeOnboarding(): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('User not authenticated');

  const [profile] = await db
    .select({ userId: schema.userProfiles.userId })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, currentUser.id))
    .limit(1);
  const [about] = await db
    .select({ userId: schema.userProfileAbout.userId })
    .from(schema.userProfileAbout)
    .where(eq(schema.userProfileAbout.userId, currentUser.id))
    .limit(1);
  // Judges fill in the Professional step instead of About.
  const [professional] = await db
    .select({ userId: schema.userProfileProfessional.userId })
    .from(schema.userProfileProfessional)
    .where(eq(schema.userProfileProfessional.userId, currentUser.id))
    .limit(1);
  if (!profile || (!about && !professional) || (await userNeedsConsent(currentUser.id))) {
    return fail('Finish your profile and accept the required policies first.');
  }

  try {
    await db.update(schema.user).set({ onboardingCompletedAt: new Date() }).where(eq(schema.user.id, currentUser.id));
    revalidatePath('/welcome', 'layout');
    return ok();
  } catch (error) {
    console.error('[account] failed to complete welcome onboarding', error);
    return fail('Unable to complete onboarding.');
  }
}

/** Upserts the single marketing-preference row, stamping `changed_at` now. */
async function upsertMarketingConsent(userId: string, optIn: boolean) {
  const now = new Date();
  return db
    .insert(schema.marketingConsents)
    .values({ userId, optedIn: optIn, changedAt: now })
    .onConflictDoUpdate({
      target: schema.marketingConsents.userId,
      set: { optedIn: optIn, changedAt: now },
    });
}

/**
 * Right to access / data portability: gathers every piece of personal data
 * tied to the signed-in user across all tables and returns it as a single
 * structured object for download. Deliberately excludes credential secrets
 * (passwords, OAuth access/refresh tokens) — those are not the user's data to
 * export and must never leave the server.
 */
export async function exportMyData(): Promise<ActionResult<unknown>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const uid = user.id;

  try {
    const [
      profile,
      profileAbout,
      interests,
      dietaryRestrictions,
      participation,
      checkInRows,
      rsvpInvitations,
      teamMemberships,
      termsHistory,
      privacyHistory,
      marketingConsent,
      linkedAccounts,
    ] = await Promise.all([
      db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, uid)),
      db.select().from(schema.userProfileAbout).where(eq(schema.userProfileAbout.userId, uid)),
      db.select().from(schema.userInterests).where(eq(schema.userInterests.userId, uid)),
      db.select().from(schema.userDietaryRestrictions).where(eq(schema.userDietaryRestrictions.userId, uid)),
      db
        .select({
          id: schema.eventParticipants.id,
          eventId: schema.eventParticipants.eventId,
          status: schema.participationStatuses.label,
          responses: schema.eventParticipants.responses,
          reviewedAt: schema.eventParticipants.reviewedAt,
          createdAt: schema.eventParticipants.createdAt,
          updatedAt: schema.eventParticipants.updatedAt,
        })
        .from(schema.eventParticipants)
        .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
        .where(eq(schema.eventParticipants.userId, uid)),
      db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, uid)),
      db
        .select({ invitation: schema.eventInvitations })
        .from(schema.eventInvitations)
        .innerJoin(schema.eventParticipants, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
        .where(eq(schema.eventParticipants.userId, uid))
        .then((rows) => rows.map((row) => row.invitation)),
      db
        .select({
          eventId: schema.teams.eventId,
          eventName: schema.events.name,
          teamId: schema.teams.id,
          teamCode: schema.teams.code,
          isOrganizer: eq(schema.teams.organizerId, uid),
          joinedAt: schema.teamMembers.joinedAt,
        })
        .from(schema.teamMembers)
        .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
        .innerJoin(schema.events, eq(schema.teams.eventId, schema.events.id))
        .where(eq(schema.teamMembers.userId, uid)),
      db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, uid)),
      db.select().from(schema.privacyAcceptances).where(eq(schema.privacyAcceptances.userId, uid)),
      db.select().from(schema.marketingConsents).where(eq(schema.marketingConsents.userId, uid)),
      // Linked auth providers only — no secrets.
      db
        .select({
          providerId: schema.account.providerId,
          accountId: schema.account.accountId,
          scope: schema.account.scope,
          createdAt: schema.account.createdAt,
        })
        .from(schema.account)
        .where(eq(schema.account.userId, uid)),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        name: user.name,
        oauthName: user.oauthName ?? null,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image ?? null,
        createdAt: user.createdAt,
        role: user.role ?? null,
      },
      linkedAccounts,
      consent: {
        termsAcceptances: termsHistory,
        privacyAcceptances: privacyHistory,
        marketing: marketingConsent[0] ?? null,
      },
      // Merged so the export's shape doesn't reveal the internal Personal/About
      // table split.
      profile: profile[0] ? { ...profile[0], ...(profileAbout[0] ?? {}) } : null,
      interests,
      dietaryRestrictions,
      eventParticipation: participation,
      checkIns: checkInRows,
      rsvpInvitations,
      teamMemberships,
    };

    return ok(exportPayload);
  } catch (error) {
    console.error('[account] failed to export data', error);
    return fail('Failed to export your data. Please try again.');
  }
}
