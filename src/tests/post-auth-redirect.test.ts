import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/utils/db', () => ({
  db: {},
  client: { end: vi.fn(async () => undefined) },
  default: {},
}));

vi.mock('@/app/dashboard/profile/actions', () => ({
  getUserProfile: vi.fn(),
}));

import { getUserProfile } from '@/app/dashboard/profile/actions';
import { resolvePostAuthRedirect } from '@/utils/post-auth-redirect';
import { auth, requireVerifiedUser } from '@/utils/auth';
import { ok, fail } from '@/utils/action-result';

const verifiedSessionUser = {
  id: 'user-1',
  email: 'a@example.com',
  emailVerified: true,
  name: 'Test User',
};

function makeSession(emailVerified: boolean) {
  return {
    user: { ...verifiedSessionUser, emailVerified },
  };
}

function expectRedirect(e: unknown, pathSubstring: string) {
  expect(e).toBeInstanceOf(Error);
  expect((e as Error).message).toContain('REDIRECT:');
  expect((e as Error).message).toContain(pathSubstring);
}

describe('requireVerifiedUser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects to signin when there is no session', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValue(null);

    await expect(requireVerifiedUser()).rejects.toThrow(
      /REDIRECT:.*\/signin.*callbackUrl=/,
    );
  });

  it('redirects to verify-email when email is not verified', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValue(
      makeSession(false) as Awaited<ReturnType<typeof auth.api.getSession>>,
    );

    await expect(requireVerifiedUser()).rejects.toThrow(
      /REDIRECT:\/verify-email/,
    );
  });

  it('returns the user when session exists and email is verified', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValue(
      makeSession(true) as Awaited<ReturnType<typeof auth.api.getSession>>,
    );

    const user = await requireVerifiedUser();
    expect(user.id).toBe(verifiedSessionUser.id);
    expect(user.email).toBe(verifiedSessionUser.email);
    expect(user.emailVerified).toBe(true);
  });
});

describe('resolvePostAuthRedirect', () => {
  beforeEach(() => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValue(
      makeSession(true) as Awaited<ReturnType<typeof auth.api.getSession>>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleProfile = {
    fullName: 'Test User',
    genderId: 1,
    universityId: 1,
    majorId: 1,
    yearOfStudyId: 1,
    interests: [] as number[],
    dietaryRestrictions: [] as number[],
  };

  it('redirects to signin when getUserProfile fails', async () => {
    vi.mocked(getUserProfile).mockResolvedValue(
      fail('Could not load profile'),
    );

    await expect(resolvePostAuthRedirect()).rejects.toThrow(
      /REDIRECT:\/signin/,
    );
  });

  it('redirects to profile with default next when no profile row', async () => {
    vi.mocked(getUserProfile).mockResolvedValue(ok(null));

    try {
      await resolvePostAuthRedirect();
    } catch (e) {
      expectRedirect(e, '/dashboard/profile?next=');
      expect((e as Error).message).toContain(
        encodeURIComponent('/dashboard/events'),
      );
    }
  });

  it('redirects to profile with sanitized next when no profile row', async () => {
    vi.mocked(getUserProfile).mockResolvedValue(ok(null));

    try {
      await resolvePostAuthRedirect({ next: '/dashboard/custom' });
    } catch (e) {
      expectRedirect(e, encodeURIComponent('/dashboard/custom'));
    }
  });

  it('redirects to /dashboard/events when profile exists and no next', async () => {
    vi.mocked(getUserProfile).mockResolvedValue(ok(sampleProfile));

    await expect(resolvePostAuthRedirect()).rejects.toThrow(
      /REDIRECT:\/dashboard\/events$/,
    );
  });

  it('redirects to safe next when profile exists', async () => {
    vi.mocked(getUserProfile).mockResolvedValue(ok(sampleProfile));

    await expect(
      resolvePostAuthRedirect({ next: '/dashboard/profile' }),
    ).rejects.toThrow(/REDIRECT:\/dashboard\/profile$/);
  });

  it('ignores invalid next when profile exists and falls back to default destination', async () => {
    vi.mocked(getUserProfile).mockResolvedValue(ok(sampleProfile));

    await expect(
      resolvePostAuthRedirect({ next: '//evil.com' }),
    ).rejects.toThrow(/REDIRECT:\/dashboard\/events$/);
  });
});
