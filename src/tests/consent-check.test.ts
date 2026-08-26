import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import { user, termsAcceptances, privacyAcceptances } from '@/db/schema';
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '@/lib/consent';
import { userNeedsConsent } from '@/utils/consent-check';

let testUserId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({ name: 'Consent Test User', email: 'consent-check@example.com', emailVerified: true })
    .returning({ id: user.id });
  testUserId = u.id;
});

afterAll(async () => {
  await db.delete(termsAcceptances).where(eq(termsAcceptances.userId, testUserId));
  await db.delete(privacyAcceptances).where(eq(privacyAcceptances.userId, testUserId));
  await db.delete(user).where(eq(user.id, testUserId));
});

async function acceptTerms(version = CURRENT_TERMS_VERSION) {
  await db.insert(termsAcceptances).values({ userId: testUserId, version });
}

async function acceptPrivacy(version = CURRENT_PRIVACY_VERSION) {
  await db.insert(privacyAcceptances).values({ userId: testUserId, version });
}

async function clearConsent() {
  await db.delete(termsAcceptances).where(eq(termsAcceptances.userId, testUserId));
  await db.delete(privacyAcceptances).where(eq(privacyAcceptances.userId, testUserId));
}

describe('userNeedsConsent', () => {
  test('returns true when neither terms nor privacy have been accepted', async () => {
    await clearConsent();
    expect(await userNeedsConsent(testUserId)).toBe(true);
  });

  test('returns true when only terms are accepted', async () => {
    await clearConsent();
    await acceptTerms();
    expect(await userNeedsConsent(testUserId)).toBe(true);
  });

  test('returns true when only privacy is accepted', async () => {
    await clearConsent();
    await acceptPrivacy();
    expect(await userNeedsConsent(testUserId)).toBe(true);
  });

  test('returns false when both are accepted at current versions', async () => {
    await clearConsent();
    await acceptTerms();
    await acceptPrivacy();
    expect(await userNeedsConsent(testUserId)).toBe(false);
  });

  test('returns true when terms are at an old version', async () => {
    await clearConsent();
    await acceptTerms('0.9');
    await acceptPrivacy();
    expect(await userNeedsConsent(testUserId)).toBe(true);
  });

  test('returns true when privacy is at an old version', async () => {
    await clearConsent();
    await acceptTerms();
    await acceptPrivacy('0.9');
    expect(await userNeedsConsent(testUserId)).toBe(true);
  });
});
