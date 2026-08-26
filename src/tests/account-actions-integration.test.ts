/**
 * Integration tests for src/app/dashboard/account/actions.ts — authenticated paths.
 * Unauthenticated cases are covered by account-actions.test.ts.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import {
  user as authUser,
  termsAcceptances,
  privacyAcceptances,
  marketingConsents,
  userProfiles,
  genders,
  universities,
  majors,
  yearsOfStudy,
} from '@/db/schema';
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '@/lib/consent';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));

import { getUser } from '@/utils/auth';
import {
  getAccountOverview,
  getConsent,
  getConsentStatus,
  setMarketingConsent,
  recordOnboardingConsent,
  completeWelcomeOnboarding,
  exportMyData,
} from '@/app/dashboard/account/actions';

type MockUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: Date;
  image: null;
  role: null;
};

let testUserId: string;
let mockUser: MockUser;

async function clearConsent() {
  await Promise.all([
    db.delete(termsAcceptances).where(eq(termsAcceptances.userId, testUserId)),
    db.delete(privacyAcceptances).where(eq(privacyAcceptances.userId, testUserId)),
    db.delete(marketingConsents).where(eq(marketingConsents.userId, testUserId)),
  ]);
}

beforeAll(async () => {
  const [u] = await db
    .insert(authUser)
    .values({ name: 'Account Test User', email: 'account-int@example.com', emailVerified: true })
    .returning({ id: authUser.id });
  testUserId = u.id;
  mockUser = {
    id: testUserId,
    email: 'account-int@example.com',
    name: 'Account Test User',
    emailVerified: true,
    createdAt: new Date(),
    image: null,
    role: null,
  };
  vi.mocked(getUser).mockResolvedValue(mockUser as never);
});

afterAll(async () => {
  await clearConsent();
  await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
  await db.delete(authUser).where(eq(authUser.id, testUserId));
});

beforeEach(async () => {
  await clearConsent();
});

// ─── getAccountOverview ────────────────────────────────────────────────────────

describe('getAccountOverview', () => {
  test('returns account summary with empty providers list', async () => {
    const result = await getAccountOverview();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.email).toBe('account-int@example.com');
    expect(result.data?.name).toBe('Account Test User');
    expect(result.data?.emailVerified).toBe(true);
    expect(Array.isArray(result.data?.providers)).toBe(true);
  });
});

// ─── getConsent ────────────────────────────────────────────────────────────────

describe('getConsent', () => {
  test('returns all-null defaults when no consent records exist', async () => {
    const result = await getConsent();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.marketingEmails).toBe(false);
    expect(result.data?.marketingConsentAt).toBeNull();
    expect(result.data?.termsVersion).toBeNull();
    expect(result.data?.privacyVersion).toBeNull();
  });

  test('returns accepted versions after recordOnboardingConsent', async () => {
    await recordOnboardingConsent(false);
    const result = await getConsent();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(result.data?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
  });
});

// ─── getConsentStatus ─────────────────────────────────────────────────────────

describe('getConsentStatus', () => {
  test('returns needsConsent: true when no records exist', async () => {
    const result = await getConsentStatus();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.needsConsent).toBe(true);
  });

  test('returns needsConsent: false after accepting current versions', async () => {
    await db.insert(termsAcceptances).values({ userId: testUserId, version: CURRENT_TERMS_VERSION });
    await db.insert(privacyAcceptances).values({ userId: testUserId, version: CURRENT_PRIVACY_VERSION });
    const result = await getConsentStatus();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.needsConsent).toBe(false);
  });
});

// ─── setMarketingConsent ──────────────────────────────────────────────────────

describe('setMarketingConsent', () => {
  test('opts the user in to marketing emails', async () => {
    const result = await setMarketingConsent(true);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.marketingEmails).toBe(true);
    expect(result.data?.marketingConsentAt).not.toBeNull();
  });

  test('opts the user back out of marketing emails', async () => {
    await setMarketingConsent(true);
    const result = await setMarketingConsent(false);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.marketingEmails).toBe(false);
    expect(result.data?.marketingConsentAt).toBeNull();
  });

  test('calling twice is idempotent (upsert)', async () => {
    await setMarketingConsent(true);
    const result = await setMarketingConsent(true);
    expect(result.success).toBe(true);
    const rows = await db
      .select()
      .from(marketingConsents)
      .where(eq(marketingConsents.userId, testUserId));
    expect(rows).toHaveLength(1);
  });
});

// ─── recordOnboardingConsent ──────────────────────────────────────────────────

describe('recordOnboardingConsent', () => {
  test('inserts terms and privacy acceptances at current versions', async () => {
    const result = await recordOnboardingConsent(false);
    expect(result.success).toBe(true);
    const [terms] = await db
      .select()
      .from(termsAcceptances)
      .where(eq(termsAcceptances.userId, testUserId));
    const [privacy] = await db
      .select()
      .from(privacyAcceptances)
      .where(eq(privacyAcceptances.userId, testUserId));
    expect(terms?.version).toBe(CURRENT_TERMS_VERSION);
    expect(privacy?.version).toBe(CURRENT_PRIVACY_VERSION);
  });

  test('does not insert duplicate terms row when already at current version', async () => {
    await recordOnboardingConsent(false);
    await recordOnboardingConsent(false);
    const rows = await db
      .select()
      .from(termsAcceptances)
      .where(eq(termsAcceptances.userId, testUserId));
    expect(rows).toHaveLength(1);
  });

  test('sets marketing consent alongside legal consent', async () => {
    await recordOnboardingConsent(true);
    const result = await getConsent();
    if (!result.success) throw new Error(result.error as string);
    expect(result.data?.marketingEmails).toBe(true);
  });
});

// ─── completeWelcomeOnboarding ────────────────────────────────────────────────

describe('completeWelcomeOnboarding', () => {
  let genderId: number;
  let universityId: number;
  let majorId: number;
  let yearId: number;

  beforeAll(async () => {
    // Seed lookup rows needed for the profile FK constraints.
    type LookupTable = typeof genders | typeof universities | typeof majors | typeof yearsOfStudy;
    const upsertLookup = async (tbl: LookupTable, label: string): Promise<number> => {
      const [existing] = await db.select({ id: tbl.id }).from(tbl).where(eq(tbl.label, label)).limit(1);
      if (existing) return existing.id;
      const [row] = await db.insert(tbl).values({ label }).returning({ id: tbl.id });
      return row!.id;
    };
    genderId = await upsertLookup(genders, 'acct-gender');
    universityId = await upsertLookup(universities, 'acct-uni');
    majorId = await upsertLookup(majors, 'acct-major');
    yearId = await upsertLookup(yearsOfStudy, 'acct-yr');
  });

  test('fails when user has no profile', async () => {
    await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
    const result = await completeWelcomeOnboarding();
    expect(result.success).toBe(false);
  });

  test('succeeds when profile exists and consent is accepted', async () => {
    // Insert profile and accept consent.
    await db
      .insert(userProfiles)
      .values({ userId: testUserId, fullName: 'Test', genderId, universityId, majorId, yearOfStudyId: yearId })
      .onConflictDoNothing();
    await db.insert(termsAcceptances).values({ userId: testUserId, version: CURRENT_TERMS_VERSION });
    await db.insert(privacyAcceptances).values({ userId: testUserId, version: CURRENT_PRIVACY_VERSION });

    const result = await completeWelcomeOnboarding();
    expect(result.success).toBe(true);

    // Cleanup.
    await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
  });
});

// ─── exportMyData ─────────────────────────────────────────────────────────────

describe('exportMyData', () => {
  test('returns a structured export object with expected top-level keys', async () => {
    const result = await exportMyData();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    const data = result.data as Record<string, unknown>;
    expect(data).toHaveProperty('exportedAt');
    expect(data).toHaveProperty('account');
    expect(data).toHaveProperty('consent');
    expect(data).toHaveProperty('profile');
    expect(data).toHaveProperty('eventApplications');
    expect(data).toHaveProperty('linkedAccounts');
    expect(Array.isArray(data.eventApplications)).toBe(true);
  });
});
