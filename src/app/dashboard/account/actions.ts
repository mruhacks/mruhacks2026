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

import { db } from '@/utils/db';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '@/lib/consent';
import { userNeedsConsent } from '@/utils/consent-check';
import {
  account,
  termsAcceptances,
  privacyAcceptances,
  marketingConsents,
  userProfiles,
  userInterests,
  userDietaryRestrictions,
  eventApplications,
  eventInterestRegistrations,
  eventAttendees,
  checkIns,
  eventRsvpResponses,
  groupMembers,
} from '@/db/schema';

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
export async function getAccountOverview(): Promise<
  ActionResult<AccountOverview>
> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const providerRows = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, user.id));

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
      .from(termsAcceptances)
      .where(eq(termsAcceptances.userId, user.id))
      .orderBy(desc(termsAcceptances.acceptedAt))
      .limit(1),
    db
      .select()
      .from(privacyAcceptances)
      .where(eq(privacyAcceptances.userId, user.id))
      .orderBy(desc(privacyAcceptances.acceptedAt))
      .limit(1),
    db
      .select()
      .from(marketingConsents)
      .where(eq(marketingConsents.userId, user.id))
      .limit(1),
  ]);

  const optedIn = marketingRow?.optedIn ?? false;

  return ok({
    marketingEmails: optedIn,
    // Only surface a timestamp while opted in — mirrors the withdrawal-clears
    // semantics the consent UI expects.
    marketingConsentAt:
      optedIn && marketingRow ? marketingRow.changedAt.toISOString() : null,
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
export async function getConsentStatus(): Promise<
  ActionResult<{ needsConsent: boolean }>
> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  return ok({ needsConsent: await userNeedsConsent(user.id) });
}

/**
 * Records the user's marketing-email consent choice with a timestamp. The
 * `changed_at` timestamp on the row is the auditable record of the most recent
 * opt-in or opt-out.
 */
export async function setMarketingConsent(
  optIn: boolean,
): Promise<ActionResult<ConsentData>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  try {
    await upsertMarketingConsent(user.id, optIn);
    return getConsent();
  } catch (error) {
    console.error('setMarketingConsent error:', error);
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
export async function recordOnboardingConsent(
  marketingOptIn: boolean,
): Promise<ActionResult<ConsentData>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  try {
    const [[latestTerms], [latestPrivacy]] = await Promise.all([
      db
        .select({ version: termsAcceptances.version })
        .from(termsAcceptances)
        .where(eq(termsAcceptances.userId, user.id))
        .orderBy(desc(termsAcceptances.acceptedAt))
        .limit(1),
      db
        .select({ version: privacyAcceptances.version })
        .from(privacyAcceptances)
        .where(eq(privacyAcceptances.userId, user.id))
        .orderBy(desc(privacyAcceptances.acceptedAt))
        .limit(1),
    ]);

    const writes: Promise<unknown>[] = [
      upsertMarketingConsent(user.id, marketingOptIn),
    ];
    if (latestTerms?.version !== CURRENT_TERMS_VERSION) {
      writes.push(
        db
          .insert(termsAcceptances)
          .values({ userId: user.id, version: CURRENT_TERMS_VERSION }),
      );
    }
    if (latestPrivacy?.version !== CURRENT_PRIVACY_VERSION) {
      writes.push(
        db
          .insert(privacyAcceptances)
          .values({ userId: user.id, version: CURRENT_PRIVACY_VERSION }),
      );
    }
    await Promise.all(writes);

    return getConsent();
  } catch (error) {
    console.error('recordOnboardingConsent error:', error);
    return fail('Failed to record your consent.');
  }
}

/** Upserts the single marketing-preference row, stamping `changed_at` now. */
async function upsertMarketingConsent(userId: string, optIn: boolean) {
  const now = new Date();
  return db
    .insert(marketingConsents)
    .values({ userId, optedIn: optIn, changedAt: now })
    .onConflictDoUpdate({
      target: marketingConsents.userId,
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
      interests,
      dietaryRestrictions,
      applications,
      interestRegistrations,
      attendance,
      checkInRows,
      rsvpResponses,
      groupMemberships,
      termsHistory,
      privacyHistory,
      marketingConsent,
      linkedAccounts,
    ] = await Promise.all([
      db.select().from(userProfiles).where(eq(userProfiles.userId, uid)),
      db.select().from(userInterests).where(eq(userInterests.userId, uid)),
      db
        .select()
        .from(userDietaryRestrictions)
        .where(eq(userDietaryRestrictions.userId, uid)),
      db
        .select()
        .from(eventApplications)
        .where(eq(eventApplications.userId, uid)),
      db
        .select()
        .from(eventInterestRegistrations)
        .where(eq(eventInterestRegistrations.userId, uid)),
      db.select().from(eventAttendees).where(eq(eventAttendees.userId, uid)),
      db.select().from(checkIns).where(eq(checkIns.userId, uid)),
      db
        .select()
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.userId, uid)),
      db.select().from(groupMembers).where(eq(groupMembers.userId, uid)),
      db
        .select()
        .from(termsAcceptances)
        .where(eq(termsAcceptances.userId, uid)),
      db
        .select()
        .from(privacyAcceptances)
        .where(eq(privacyAcceptances.userId, uid)),
      db.select().from(marketingConsents).where(eq(marketingConsents.userId, uid)),
      // Linked auth providers only — no secrets.
      db
        .select({
          providerId: account.providerId,
          accountId: account.accountId,
          scope: account.scope,
          createdAt: account.createdAt,
        })
        .from(account)
        .where(eq(account.userId, uid)),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        name: user.name,
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
      profile: profile[0] ?? null,
      interests,
      dietaryRestrictions,
      eventApplications: applications,
      eventInterestRegistrations: interestRegistrations,
      eventAttendance: attendance,
      checkIns: checkInRows,
      rsvpResponses,
      groupMemberships,
    };

    return ok(exportPayload);
  } catch (error) {
    console.error('exportMyData error:', error);
    return fail('Failed to export your data. Please try again.');
  }
}
