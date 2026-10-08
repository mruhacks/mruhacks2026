import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import {
  user,
  userProfiles,
  userProfileAbout,
  userProfileProfessional,
  userDietaryRestrictions,
  genders,
  universities,
  majors,
  yearsOfStudy,
  dietaryRestrictions,
  events,
  eventJudges,
} from '@/db/schema';
import {
  getUserProfile,
  savePersonalProfile,
  saveAboutProfile,
  saveFullProfile,
  saveProfessionalProfile,
  getProfessionalProfile,
  removeProfilePicture,
  removeResume,
  getOwnResume,
} from '@/app/dashboard/profile/actions';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
}));

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
  await db
    .delete(userProfileAbout)
    .where(eq(userProfileAbout.userId, testUserId));
  await db
    .delete(userProfileProfessional)
    .where(eq(userProfileProfessional.userId, testUserId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
  await db.delete(user).where(eq(user.id, testUserId));
});

function validPersonalData() {
  return {
    fullName: 'Alice Smith',
    genderId,
    dietaryRestrictions: [],
    linkedinUrl: '',
  };
}

function validAboutData() {
  return {
    universityId,
    majorId,
    yearOfStudyId,
    githubUrl: '',
  };
}

function validProfileData() {
  return { ...validPersonalData(), ...validAboutData() };
}

async function clearProfile() {
  await db
    .delete(userDietaryRestrictions)
    .where(eq(userDietaryRestrictions.userId, testUserId));
  await db
    .delete(userProfileAbout)
    .where(eq(userProfileAbout.userId, testUserId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
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
    if (!result.success) throw new Error(result.error);
    expect(result.data).toBeNull();
  });

  test('returns profile data with null about-fields when only the personal step is done', async () => {
    await db.insert(userProfiles).values({
      userId: testUserId,
      fullName: 'Alice Smith',
      genderId,
    });

    const result = await getUserProfile();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.fullName).toBe('Alice Smith');
    expect(result.data?.genderId).toBe(genderId);
    expect(result.data?.dietaryRestrictions).toEqual([]);
    expect(result.data?.universityId).toBeNull();
    expect(result.data?.majorId).toBeNull();
    expect(result.data?.yearOfStudyId).toBeNull();

    await clearProfile();
  });

  test('includes about fields once the about step is also saved', async () => {
    await db.insert(userProfiles).values({
      userId: testUserId,
      fullName: 'Bob',
      genderId,
    });
    await db.insert(userProfileAbout).values({
      userId: testUserId,
      universityId,
      majorId,
      yearOfStudyId,
    });

    const result = await getUserProfile();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.universityId).toBe(universityId);
    expect(result.data?.majorId).toBe(majorId);
    expect(result.data?.yearOfStudyId).toBe(yearOfStudyId);

    await clearProfile();
  });

  test('includes dietary restrictions in profile', async () => {
    await db.insert(userProfiles).values({
      userId: testUserId,
      fullName: 'Bob',
      genderId,
    });
    await db
      .insert(userDietaryRestrictions)
      .values({ userId: testUserId, restrictionId: dietaryRestrictionId });

    const result = await getUserProfile();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.dietaryRestrictions).toContain(dietaryRestrictionId);

    await clearProfile();
  });
});

describe('savePersonalProfile', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await savePersonalProfile(validPersonalData());
    expect(result.success).toBe(false);
  });

  test('returns validation error for invalid data', async () => {
    const result = await savePersonalProfile({
      ...validPersonalData(),
      fullName: '',
    });
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('Validation');
  });

  test('runtime-validates attendedHackathonBefore', async () => {
    const result = await saveAboutProfile({
      ...validAboutData(),
      attendedHackathonBefore: 'yes',
    } as never);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('Validation');

    const [about] = await db
      .select()
      .from(userProfileAbout)
      .where(eq(userProfileAbout.userId, testUserId));
    expect(about).toBeUndefined();
  });

  test('creates profile on first save, independent of the about step', async () => {
    const result = await savePersonalProfile(validPersonalData());
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

    const [about] = await db
      .select()
      .from(userProfileAbout)
      .where(eq(userProfileAbout.userId, testUserId));
    expect(about).toBeUndefined();
  });

  test('upserts profile on subsequent save', async () => {
    const result = await savePersonalProfile({
      ...validPersonalData(),
      fullName: 'Alice Updated',
    });
    expect(result.success).toBe(true);

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId));
    expect(profile.fullName).toBe('Alice Updated');
  });

  test('saves dietary restrictions', async () => {
    await savePersonalProfile({
      ...validPersonalData(),
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
    await savePersonalProfile({
      ...validPersonalData(),
      dietaryRestrictions: [],
    });

    const rows = await db
      .select()
      .from(userDietaryRestrictions)
      .where(eq(userDietaryRestrictions.userId, testUserId));
    expect(rows).toHaveLength(0);

    await clearProfile();
  });

  test('saves linkedin on the shared profile row, normalized to https without query params', async () => {
    await savePersonalProfile({
      ...validPersonalData(),
      linkedinUrl: 'http://www.linkedin.com/in/alice/?utm_source=x&trk=y',
    });

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId));
    expect(profile.linkedinUrl).toBe('https://www.linkedin.com/in/alice');

    const result = await getUserProfile();
    if (!result.success) throw new Error(result.error);
    expect(result.data?.linkedinUrl).toBe('https://www.linkedin.com/in/alice');
  });

  test('clears linkedin when saved blank', async () => {
    await savePersonalProfile({ ...validPersonalData(), linkedinUrl: '' });

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId));
    expect(profile.linkedinUrl).toBeNull();

    await clearProfile();
  });

  test('validation fails for a non-linkedin host, even if it contains "linkedin.com"', async () => {
    const result = await savePersonalProfile({
      ...validPersonalData(),
      linkedinUrl: 'https://linkedin.com.evil.com/in/alice',
    });
    expect(result.success).toBe(false);
  });

  test('validation fails when a github url is put in the linkedin field', async () => {
    const result = await savePersonalProfile({
      ...validPersonalData(),
      linkedinUrl: 'https://github.com/alice',
    });
    expect(result.success).toBe(false);
  });

  test('validation fails for a malformed linkedin url', async () => {
    const result = await savePersonalProfile({
      ...validPersonalData(),
      linkedinUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('saveAboutProfile', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await saveAboutProfile({
      ...validAboutData(),
      attendedHackathonBefore: false,
    });
    expect(result.success).toBe(false);
  });

  test('returns validation error for invalid data', async () => {
    const result = await saveAboutProfile({
      universityId: 0,
      majorId,
      yearOfStudyId,
      githubUrl: '',
      attendedHackathonBefore: false,
    });
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('Validation');
  });

  test('creates the about row independent of the personal step, and saves attendedHackathonBefore', async () => {
    const result = await saveAboutProfile({
      ...validAboutData(),
      attendedHackathonBefore: true,
    });
    expect(result.success).toBe(true);

    const [about] = await db
      .select()
      .from(userProfileAbout)
      .where(eq(userProfileAbout.userId, testUserId));
    expect(about.universityId).toBe(universityId);
    expect(about.attendedHackathonBefore).toBe(true);
  });

  test('upserts on subsequent save without touching attendedHackathonBefore when omitted', async () => {
    const result = await saveAboutProfile({
      ...validAboutData(),
      attendedHackathonBefore: false,
    });
    expect(result.success).toBe(true);

    const [about] = await db
      .select()
      .from(userProfileAbout)
      .where(eq(userProfileAbout.userId, testUserId));
    expect(about.attendedHackathonBefore).toBe(false);
  });

  test('saves the github url, stripping query params and the hash', async () => {
    await saveAboutProfile({
      ...validAboutData(),
      githubUrl: 'https://github.com/alice?tab=repositories#readme',
      attendedHackathonBefore: false,
    });

    const [about] = await db
      .select()
      .from(userProfileAbout)
      .where(eq(userProfileAbout.userId, testUserId));
    expect(about.githubUrl).toBe('https://github.com/alice');

    await clearProfile();
  });

  test('validation fails when a linkedin url is put in the github field', async () => {
    const result = await saveAboutProfile({
      ...validAboutData(),
      githubUrl: 'https://linkedin.com/in/alice',
      attendedHackathonBefore: false,
    });
    expect(result.success).toBe(false);
  });
});

// ─── saveFullProfile ───────────────────────────────────────────────────────

describe('saveFullProfile', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await saveFullProfile(validProfileData());
    expect(result.success).toBe(false);
  });

  test('saves both personal and about fields in one call', async () => {
    const result = await saveFullProfile(validProfileData());
    expect(result.success).toBe(true);

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId));
    const [about] = await db
      .select()
      .from(userProfileAbout)
      .where(eq(userProfileAbout.userId, testUserId));
    expect(profile.fullName).toBe('Alice Smith');
    expect(about.universityId).toBe(universityId);
  });

  test('validates the full payload before saving either profile half', async () => {
    await clearProfile();

    const result = await saveFullProfile({
      ...validProfileData(),
      universityId: 0,
    });
    expect(result.success).toBe(false);

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId));
    const [about] = await db
      .select()
      .from(userProfileAbout)
      .where(eq(userProfileAbout.userId, testUserId));
    expect(profile).toBeUndefined();
    expect(about).toBeUndefined();
  });

  test('does not clobber attendedHackathonBefore, which it never collects', async () => {
    await saveAboutProfile({
      ...validAboutData(),
      attendedHackathonBefore: true,
    });

    await saveFullProfile({
      ...validProfileData(),
      fullName: 'Alice Again',
    });

    const [about] = await db
      .select()
      .from(userProfileAbout)
      .where(eq(userProfileAbout.userId, testUserId));
    expect(about.attendedHackathonBefore).toBe(true);

    await clearProfile();
  });

  test('requires the student half from someone who is not a judge', async () => {
    await clearProfile();
    const result = await saveFullProfile({
      ...validPersonalData(),
      githubUrl: '',
    });
    expect(result.success).toBe(false);
  });

  describe('for a judge', () => {
    let eventId: string;

    beforeAll(async () => {
      const [event] = await db
        .insert(events)
        .values({ name: 'Profile Judge Test Event' })
        .returning({ id: events.id });
      eventId = event.id;
      await db.insert(eventJudges).values({
        eventId,
        userId: testUserId,
        email: 'profile-test@example.com',
      });
    });

    afterAll(async () => {
      await db.delete(events).where(eq(events.id, eventId));
    });

    test('saves the personal half without any student fields', async () => {
      await clearProfile();
      const result = await saveFullProfile({
        ...validPersonalData(),
        githubUrl: '',
      });
      expect(result.success).toBe(true);

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, testUserId));
      const [about] = await db
        .select()
        .from(userProfileAbout)
        .where(eq(userProfileAbout.userId, testUserId));
      expect(profile.fullName).toBe('Alice Smith');
      expect(about).toBeUndefined();
    });

    test('rejects a partly filled student half', async () => {
      await clearProfile();
      const result = await saveFullProfile({
        ...validPersonalData(),
        universityId,
        githubUrl: '',
      });
      expect(result.success).toBe(false);

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, testUserId));
      expect(profile).toBeUndefined();
    });

    test('still saves a complete student half', async () => {
      await clearProfile();
      const result = await saveFullProfile(validProfileData());
      expect(result.success).toBe(true);

      const [about] = await db
        .select()
        .from(userProfileAbout)
        .where(eq(userProfileAbout.userId, testUserId));
      expect(about.universityId).toBe(universityId);
      await clearProfile();
    });

    test('a linkedin alone is personal, not a partly filled student half', async () => {
      await clearProfile();
      const result = await saveFullProfile({
        ...validPersonalData(),
        linkedinUrl: 'https://linkedin.com/in/alice',
        githubUrl: '',
      });
      expect(result.success).toBe(true);

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, testUserId));
      const [about] = await db
        .select()
        .from(userProfileAbout)
        .where(eq(userProfileAbout.userId, testUserId));
      expect(profile.linkedinUrl).toBe('https://linkedin.com/in/alice');
      expect(about).toBeUndefined();
      await clearProfile();
    });

    test('the professional profile shares the personal linkedin instead of keeping its own', async () => {
      await clearProfile();
      await saveFullProfile({
        ...validPersonalData(),
        linkedinUrl: 'https://linkedin.com/in/alice',
        githubUrl: '',
      });
      const saved = await saveProfessionalProfile({
        company: 'Acme',
        jobTitle: 'Engineer',
      });
      expect(saved.success).toBe(true);

      const professional = await getProfessionalProfile();
      if (!professional.success) throw new Error(professional.error);
      expect(professional.data).toEqual({
        company: 'Acme',
        jobTitle: 'Engineer',
      });

      // Saving the professional half leaves the shared value alone.
      const profile = await getUserProfile();
      if (!profile.success) throw new Error(profile.error);
      expect(profile.data?.linkedinUrl).toBe('https://linkedin.com/in/alice');

      await db
        .delete(userProfileProfessional)
        .where(eq(userProfileProfessional.userId, testUserId));
      await clearProfile();
    });
  });
});

// ─── removeProfilePicture ─────────────────────────────────────────────────────

describe('removeProfilePicture', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await removeProfilePicture();
    expect(result.success).toBe(false);
  });

  test('succeeds when user has no profile picture (no-op S3)', async () => {
    // Ensure user has no image set.
    await db.update(user).set({ image: null }).where(eq(user.id, testUserId));
    const result = await removeProfilePicture();
    expect(result.success).toBe(true);
  });
});

// ─── removeResume ─────────────────────────────────────────────────────────────

describe('removeResume', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await removeResume();
    expect(result.success).toBe(false);
  });

  test('succeeds when user has no resume (no-op S3)', async () => {
    // Profile has no resume; update should clear nulls with no S3 call.
    const result = await removeResume();
    expect(result.success).toBe(true);
  });
});

// ─── getOwnResume ─────────────────────────────────────────────────────────────

describe('getOwnResume', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await getOwnResume();
    expect(result.success).toBe(false);
  });

  test('returns ok(null) when no resume is set', async () => {
    const result = await getOwnResume();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data).toBeNull();
  });
});
