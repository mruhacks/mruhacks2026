import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/utils/auth', () => ({
  getUser: vi.fn(),
}));

vi.mock('@/app/dashboard/profile/actions', () => ({
  getUserProfile: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import { getUserProfile } from '@/app/dashboard/profile/actions';
import { registerForEvent, unregisterFromEvent } from '@/app/register/actions';
import {
  REGISTER_EMAIL_NOT_VERIFIED_MESSAGE,
  REGISTER_NEEDS_PROFILE_MESSAGE,
} from '@/app/register/messages';
import { ok, fail } from '@/utils/action-result';

const now = new Date();

const verifiedUser = {
  id: 'u1',
  email: 'user@test.com',
  emailVerified: true,
  name: 'Test',
  createdAt: now,
  updatedAt: now,
};

const unverifiedUser = {
  ...verifiedUser,
  emailVerified: false,
};

describe('registerForEvent', () => {
  beforeEach(() => {
    vi.mocked(getUser).mockReset();
    vi.mocked(getUserProfile).mockReset();
  });

  it('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const result = await registerForEvent('event-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('User not authenticated');
    }
  });

  it('fails when email is not verified', async () => {
    vi.mocked(getUser).mockResolvedValue(unverifiedUser);

    const result = await registerForEvent('event-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(REGISTER_EMAIL_NOT_VERIFIED_MESSAGE);
    }
  });

  it('fails when profile cannot be loaded', async () => {
    vi.mocked(getUser).mockResolvedValue(verifiedUser);
    vi.mocked(getUserProfile).mockResolvedValue(fail('db error'));

    const result = await registerForEvent('event-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('db error');
    }
  });

  it('fails when user has no profile row', async () => {
    vi.mocked(getUser).mockResolvedValue(verifiedUser);
    vi.mocked(getUserProfile).mockResolvedValue(ok(null));

    const result = await registerForEvent('event-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(REGISTER_NEEDS_PROFILE_MESSAGE);
    }
  });
});

describe('unregisterFromEvent', () => {
  beforeEach(() => {
    vi.mocked(getUser).mockReset();
    vi.mocked(getUserProfile).mockReset();
  });

  it('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const result = await unregisterFromEvent('event-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('User not authenticated');
    }
  });

  it('fails when email is not verified', async () => {
    vi.mocked(getUser).mockResolvedValue(unverifiedUser);

    const result = await unregisterFromEvent('event-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(REGISTER_EMAIL_NOT_VERIFIED_MESSAGE);
    }
  });

  it('fails when user has no profile row', async () => {
    vi.mocked(getUser).mockResolvedValue(verifiedUser);
    vi.mocked(getUserProfile).mockResolvedValue(ok(null));

    const result = await unregisterFromEvent('event-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(REGISTER_NEEDS_PROFILE_MESSAGE);
    }
  });
});
