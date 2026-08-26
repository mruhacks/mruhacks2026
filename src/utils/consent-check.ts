import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import { termsAcceptances, privacyAcceptances } from '@/db/schema';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '@/lib/consent';

/**
 * Whether a user still owes consent before they may use authenticated parts of
 * the app: true when they've never accepted the Terms of Use / Privacy Policy,
 * or accepted an older version than the one currently in force.
 *
 * Kept as a tiny, dependency-light query so it can run in the proxy on every
 * protected navigation without meaningful overhead.
 */
export async function userNeedsConsent(userId: string): Promise<boolean> {
  const [terms, privacy] = await Promise.all([
    db
      .select({ version: termsAcceptances.version })
      .from(termsAcceptances)
      .where(eq(termsAcceptances.userId, userId))
      .orderBy(desc(termsAcceptances.acceptedAt))
      .limit(1),
    db
      .select({ version: privacyAcceptances.version })
      .from(privacyAcceptances)
      .where(eq(privacyAcceptances.userId, userId))
      .orderBy(desc(privacyAcceptances.acceptedAt))
      .limit(1),
  ]);

  return (
    terms[0]?.version !== CURRENT_TERMS_VERSION ||
    privacy[0]?.version !== CURRENT_PRIVACY_VERSION
  );
}
