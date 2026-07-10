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

import { eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import {
  account,
  userConsents,
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

/** Returns the user's consent record, creating a default (opted-out) view. */
export async function getConsent(): Promise<ActionResult<ConsentData>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const [row] = await db
    .select()
    .from(userConsents)
    .where(eq(userConsents.userId, user.id))
    .limit(1);

  return ok({
    marketingEmails: row?.marketingEmails ?? false,
    marketingConsentAt: row?.marketingConsentAt?.toISOString() ?? null,
  });
}

/**
 * Records the user's marketing-email consent choice with a timestamp. Opting
 * in stamps `marketingConsentAt`; opting out clears it. The timestamp is the
 * auditable record of consent (and its withdrawal).
 */
export async function setMarketingConsent(
  optIn: boolean,
): Promise<ActionResult<ConsentData>> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const now = new Date();
  const consentAt = optIn ? now : null;

  try {
    await db
      .insert(userConsents)
      .values({
        userId: user.id,
        marketingEmails: optIn,
        marketingConsentAt: consentAt,
      })
      .onConflictDoUpdate({
        target: userConsents.userId,
        set: {
          marketingEmails: optIn,
          marketingConsentAt: consentAt,
          updatedAt: now,
        },
      });

    return ok({
      marketingEmails: optIn,
      marketingConsentAt: consentAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('setMarketingConsent error:', error);
    return fail('Failed to update your preferences.');
  }
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
      consent,
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
      db.select().from(userConsents).where(eq(userConsents.userId, uid)),
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
      consent: consent[0] ?? null,
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
