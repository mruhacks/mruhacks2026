import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import {
  user,
  userProfiles,
  userDietaryRestrictions,
  genders,
  universities,
  majors,
  yearsOfStudy,
  dietaryRestrictions,
} from '@/db/schema';
import {
  getUserProfile,
  saveUserProfile,
} from '@/app/dashboard/profile/actions';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));

import { getUser } from '@/utils/auth';

let testUserId: string;
let genderId: number;
let universityId: number;
let majorId: number;
let yearOfStudyId: number;
let dietaryRestrictionId: number;

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({
      name: 'Profile Test User',
      email: 'profile-test@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = u.id;

  const [g] = await db
    .insert(genders)
    .values({ label: 'test-gender' })
    .onConflictDoNothing()
    .returning({ id: genders.id });
  if (g) {
    genderId = g.id;
  } else {
    const [existing] = await db
      .select({ id: genders.id })
      .from(genders)
      .where(eq(genders.label, 'test-gender'))
      .limit(1);
    genderId = existing.id;
  }

  const [uni] = await db
    .insert(universities)
    .values({ label: 'test-university' })
    .onConflictDoNothing()
    .returning({ id: universities.id });
  if (uni) {
    universityId = uni.id;
  } else {
    const [existing] = await db
      .select({ id: universities.id })
      .from(universities)
      .where(eq(universities.label, 'test-university'))
      .limit(1);
    universityId = existing.id;
  }

  const [maj] = await db
    .insert(majors)
    .values({ label: 'test-major' })
    .onConflictDoNothing()
    .returning({ id: majors.id });
  if (maj) {
    majorId = maj.id;
  } else {
    const [existing] = await db
      .select({ id: majors.id })
      .from(majors)
      .where(eq(majors.label, 'test-major'))
      .limit(1);
    majorId = existing.id;
  }

  const [yr] = await db
    .insert(yearsOfStudy)
    .values({ label: '1st' })
    .onConflictDoNothing()
    .returning({ id: yearsOfStudy.id });
  if (yr) {
    yearOfStudyId = yr.id;
  } else {
    const [existing] = await db
      .select({ id: yearsOfStudy.id })
      .from(yearsOfStudy)
      .where(eq(yearsOfStudy.label, '1st'))
      .limit(1);
    yearOfStudyId = existing.id;
  }

  const [diet] = await db
    .insert(dietaryRestrictions)
    .values({ label: 'test-diet' })
    .onConflictDoNothing()
    .returning({ id: dietaryRestrictions.id });
  if (diet) {
    dietaryRestrictionId = diet.id;
  } else {
    const [existing] = await db
      .select({ id: dietaryRestrictions.id })
      .from(dietaryRestrictions)
      .where(eq(dietaryRestrictions.label, 'test-diet'))
      .limit(1);
    dietaryRestrictionId = existing.id;
  }

  vi.mocked(getUser).mockResolvedValue({
    id: testUserId,
    email: 'profile-test@example.com',
    name: 'Profile Test User',
    emailVerified: true,
  } as never);
});

afterAll(async () => {
  await db
    .delete(userDietaryRestrictions)
    .where(eq(userDietaryRestrictions.userId, testUserId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
  await db.delete(user).where(eq(user.id, testUserId));
});

function validProfileData() {
  return {
    fullName: 'Alice Smith',
    genderId,
    universityId,
    majorId,
    yearOfStudyId,
    dietaryRestrictions: [],
  };
}

describe('getUserProfile', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await getUserProfile();
    expect(result.success).toBe(false);
  });

  test('returns ok(null) when no profile exists', async () => {
    const result = await getUserProfile();
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  test('returns profile data when profile exists', async () => {
    await db.insert(userProfiles).values({
      userId: testUserId,
      fullName: 'Alice Smith',
      genderId,
      universityId,
      majorId,
      yearOfStudyId,
    });

    const result = await getUserProfile();
    expect(result.success).toBe(true);
    expect(result.data?.fullName).toBe('Alice Smith');
    expect(result.data?.genderId).toBe(genderId);
    expect(result.data?.dietaryRestrictions).toEqual([]);

    await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
  });

  test('includes dietary restrictions in profile', async () => {
    await db.insert(userProfiles).values({
      userId: testUserId,
      fullName: 'Bob',
      genderId,
      universityId,
      majorId,
      yearOfStudyId,
    });
    await db
      .insert(userDietaryRestrictions)
      .values({ userId: testUserId, restrictionId: dietaryRestrictionId });

    const result = await getUserProfile();
    expect(result.success).toBe(true);
    expect(result.data?.dietaryRestrictions).toContain(dietaryRestrictionId);

    await db
      .delete(userDietaryRestrictions)
      .where(eq(userDietaryRestrictions.userId, testUserId));
    await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
  });
});

describe('saveUserProfile', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await saveUserProfile(validProfileData());
    expect(result.success).toBe(false);
  });

  test('returns validation error for invalid data', async () => {
    const result = await saveUserProfile({
      fullName: '',
      genderId,
      universityId,
      majorId,
      yearOfStudyId,
      dietaryRestrictions: [],
    });
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('Validation');
  });

  test('creates profile on first save', async () => {
    const result = await saveUserProfile(validProfileData());
    expect(result.success).toBe(true);

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId));
    expect(profile.fullName).toBe('Alice Smith');
    expect(profile.genderId).toBe(genderId);

    const [updatedUser] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, testUserId));
    expect(updatedUser.name).toBe('Alice Smith');
  });

  test('upserts profile on subsequent save', async () => {
    const result = await saveUserProfile({
      ...validProfileData(),
      fullName: 'Alice Updated',
    });
    expect(result.success).toBe(true);

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId));
    expect(profile.fullName).toBe('Alice Updated');
  });

  test('saves linkedin and github urls', async () => {
    await saveUserProfile({
      ...validProfileData(),
      linkedinUrl: 'https://linkedin.com/in/alice',
      githubUrl: 'https://github.com/alice',
    });

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId));
    expect(profile.linkedinUrl).toBe('https://linkedin.com/in/alice');
    expect(profile.githubUrl).toBe('https://github.com/alice');
  });

  test('strips query params and normalizes to https', async () => {
    await saveUserProfile({
      ...validProfileData(),
      linkedinUrl: 'http://www.linkedin.com/in/alice/?utm_source=x&trk=y',
      githubUrl: 'https://github.com/alice?tab=repositories#readme',
    });

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId));
    expect(profile.linkedinUrl).toBe('https://www.linkedin.com/in/alice');
    expect(profile.githubUrl).toBe('https://github.com/alice');
  });

  test('validation fails for a non-linkedin host, even if it contains "linkedin.com"', async () => {
    const result = await saveUserProfile({
      ...validProfileData(),
      linkedinUrl: 'https://linkedin.com.evil.com/in/alice',
    });
    expect(result.success).toBe(false);
  });

  test('validation fails when a github url is put in the linkedin field', async () => {
    const result = await saveUserProfile({
      ...validProfileData(),
      linkedinUrl: 'https://github.com/alice',
    });
    expect(result.success).toBe(false);
  });

  test('saves dietary restrictions', async () => {
    await saveUserProfile({
      ...validProfileData(),
      dietaryRestrictions: [dietaryRestrictionId],
    });

    const rows = await db
      .select()
      .from(userDietaryRestrictions)
      .where(eq(userDietaryRestrictions.userId, testUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0].restrictionId).toBe(dietaryRestrictionId);
  });

  test('clears dietary restrictions when empty array is saved', async () => {
    await saveUserProfile({ ...validProfileData(), dietaryRestrictions: [] });

    const rows = await db
      .select()
      .from(userDietaryRestrictions)
      .where(eq(userDietaryRestrictions.userId, testUserId));
    expect(rows).toHaveLength(0);
  });

  test('validation fails for a malformed linkedin url', async () => {
    const result = await saveUserProfile({
      ...validProfileData(),
      linkedinUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});
